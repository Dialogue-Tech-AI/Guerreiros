import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Warranty } from '../../domain/entities/warranty.entity';
import { Purchase } from '../../../purchase/domain/entities/purchase.entity';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { logger } from '../../../../shared/utils/logger';
import { UUID } from '../../../../shared/types/common.types';

export class WarrantyService {
  /**
   * Create warranty for a purchase (6 months from purchase date)
   */
  async createWarranty(purchaseId: UUID): Promise<Warranty> {
    try {
      const purchaseRepo = AppDataSource.getRepository(Purchase);
      const purchase = await purchaseRepo.findOne({
        where: { id: purchaseId },
        relations: ['attendance'],
      });

      if (!purchase) {
        throw new Error(`Purchase ${purchaseId} not found`);
      }

      const warrantyRepo = AppDataSource.getRepository(Warranty);
      
      // Calculate warranty dates
      const startDate = purchase.purchaseDate;
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 6); // 6 months warranty

      const warranty = warrantyRepo.create({
        purchaseId: purchase.id,
        attendanceId: purchase.attendanceId,
        startDate,
        endDate,
        isActive: true,
        claimsCount: 0,
      });

      const savedWarranty = await warrantyRepo.save(warranty);

      logger.info('Warranty created', {
        warrantyId: savedWarranty.id,
        purchaseId,
        startDate,
        endDate,
      });

      return savedWarranty;
    } catch (error: any) {
      logger.error('Error creating warranty', {
        error: error.message,
        purchaseId,
      });
      throw error;
    }
  }

  /**
   * Check if there is an active warranty for an attendance
   */
  async isWarrantyActive(attendanceId: UUID): Promise<boolean> {
    try {
      const warrantyRepo = AppDataSource.getRepository(Warranty);
      
      const activeWarranty = await warrantyRepo.findOne({
        where: {
          attendanceId,
          isActive: true,
        },
      });

      if (!activeWarranty) {
        return false;
      }

      // Check if warranty is still valid (endDate > now)
      const now = new Date();
      if (activeWarranty.endDate <= now) {
        // Update isActive to false
        activeWarranty.isActive = false;
        await warrantyRepo.save(activeWarranty);
        return false;
      }

      return true;
    } catch (error: any) {
      logger.error('Error checking warranty status', {
        error: error.message,
        attendanceId,
      });
      return false; // Assume no warranty on error
    }
  }

  /**
   * Check if an attendance can be finalized (all conditions met)
   */
  async canFinalizeAttendance(attendanceId: UUID): Promise<boolean> {
    try {
      const attendanceRepo = AppDataSource.getRepository(Attendance);
      const purchaseRepo = AppDataSource.getRepository(Purchase);
      const warrantyRepo = AppDataSource.getRepository(Warranty);

      const attendance = await attendanceRepo.findOne({
        where: { id: attendanceId },
      });

      if (!attendance) {
        return false;
      }

      // Condition 1: operationalState === FECHADO_OPERACIONAL
      if (attendance.operationalState !== 'FECHADO_OPERACIONAL') {
        logger.debug('Attendance not closed operationally', { attendanceId });
        return false;
      }

      // Condition 2: purchaseDate exists and purchaseDate + 6 meses < now
      if (!attendance.purchaseDate) {
        logger.debug('No purchase date', { attendanceId });
        return false; // No purchase, can't finalize
      }

      const sixMonthsAfterPurchase = new Date(attendance.purchaseDate);
      sixMonthsAfterPurchase.setMonth(sixMonthsAfterPurchase.getMonth() + 6);
      const now = new Date();

      if (sixMonthsAfterPurchase >= now) {
        logger.debug('Warranty period not expired', {
          attendanceId,
          purchaseDate: attendance.purchaseDate,
          sixMonthsAfter: sixMonthsAfterPurchase,
        });
        return false;
      }

      // Condition 3: No active warranty
      const hasActiveWarranty = await this.isWarrantyActive(attendanceId);
      if (hasActiveWarranty) {
        logger.debug('Active warranty exists', { attendanceId });
        return false;
      }

      // Condition 4: No pending exchange (attendanceType = TROCA and operationalState != FECHADO_OPERACIONAL)
      if (attendance.attendanceType === 'TROCA' && 
          attendance.operationalState !== 'FECHADO_OPERACIONAL') {
        logger.debug('Pending exchange', { attendanceId });
        return false;
      }

      // Condition 5: No pending refund (attendanceType = ESTORNO and Purchase.status != ESTORNADO)
      if (attendance.attendanceType === 'ESTORNO') {
        const purchase = await purchaseRepo.findOne({
          where: { attendanceId },
          order: { createdAt: 'DESC' },
        });

        if (purchase && purchase.status !== 'ESTORNADO') {
          logger.debug('Pending refund', { attendanceId, purchaseStatus: purchase.status });
          return false;
        }
      }

      // Condition 6: No open debt (Purchase.status = PAGO)
      const purchase = await purchaseRepo.findOne({
        where: { attendanceId },
        order: { createdAt: 'DESC' },
      });

      if (purchase && purchase.status !== 'PAGO') {
        logger.debug('Purchase not paid', { attendanceId, purchaseStatus: purchase.status });
        return false;
      }

      // All conditions met
      logger.info('Attendance can be finalized', { attendanceId });
      return true;
    } catch (error: any) {
      logger.error('Error checking if attendance can be finalized', {
        error: error.message,
        attendanceId,
      });
      return false;
    }
  }

  /**
   * Update warranty active status based on endDate
   */
  async updateWarrantyStatuses(): Promise<number> {
    try {
      const warrantyRepo = AppDataSource.getRepository(Warranty);
      
      const now = new Date();
      
      // Update expired warranties
      const result = await warrantyRepo
        .createQueryBuilder()
        .update(Warranty)
        .set({ isActive: false })
        .where('is_active = :isActive', { isActive: true })
        .andWhere('end_date <= :now', { now })
        .execute();

      const updatedCount = result.affected || 0;

      if (updatedCount > 0) {
        logger.info('Updated warranty statuses', { updatedCount });
      }

      return updatedCount;
    } catch (error: any) {
      logger.error('Error updating warranty statuses', {
        error: error.message,
      });
      return 0;
    }
  }
}
