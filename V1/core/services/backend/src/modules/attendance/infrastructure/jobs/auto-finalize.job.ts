import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { Attendance } from '../../domain/entities/attendance.entity';
import { WarrantyService } from '../../../warranty/application/services/warranty.service';
import { OperationalState } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';

export class AutoFinalizeJob {
  private warrantyService: WarrantyService;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (daily)

  constructor() {
    this.warrantyService = new WarrantyService();
  }

  /**
   * Start the auto-finalize job
   * Runs daily
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Auto-finalize job already running');
      return;
    }

    logger.info('Starting auto-finalize job (runs daily)');

    // Run immediately on start
    this.run();

    // Then run daily
    this.intervalId = setInterval(() => {
      this.run();
    }, this.INTERVAL_MS);
  }

  /**
   * Stop the auto-finalize job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped auto-finalize job');
    }
  }

  /**
   * Run the auto-finalize check
   */
  private async run(): Promise<void> {
    try {
      const attendanceRepo = AppDataSource.getRepository(Attendance);
      
      // Find attendances that are closed operationally but not finalized
      const attendancesToCheck = await attendanceRepo.find({
        where: {
          operationalState: OperationalState.FECHADO_OPERACIONAL,
          isFinalized: false,
        },
      });

      let finalizedCount = 0;

      for (const attendance of attendancesToCheck) {
        const canFinalize = await this.warrantyService.canFinalizeAttendance(attendance.id);
        
        if (canFinalize) {
          attendance.isFinalized = true;
          attendance.finalizedAt = new Date();
          await attendanceRepo.save(attendance);
          finalizedCount++;
          
          logger.info('Auto-finalized attendance', {
            attendanceId: attendance.id,
            purchaseDate: attendance.purchaseDate,
          });
        }
      }

      if (finalizedCount > 0) {
        logger.info('Auto-finalize job completed', { finalizedCount });
      }
    } catch (error: any) {
      logger.error('Error in auto-finalize job', {
        error: error.message,
        stack: error.stack,
      });
    }
  }
}
