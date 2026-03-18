import { Router, Request, Response } from 'express';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { User } from '../../domain/entities/user.entity';
import { Seller } from '../../../seller/domain/entities/seller.entity';
import { Supervisor } from '../../../supervisor/domain/entities/supervisor.entity';
import { Attendance } from '../../../attendance/domain/entities/attendance.entity';
import { getSellersBySupervisorId } from '../../../seller/application/get-sellers-by-supervisor';
import { UserRole, VehicleBrand, OperationalState } from '../../../../shared/types/common.types';
import { AuthService } from '../../application/services/auth.service';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { validateBody } from '../../../../shared/presentation/middlewares/validation.middleware';
import { requireSuperAdmin } from '../../../../shared/presentation/middlewares/permission.middleware';
import { authMiddleware } from '../../../../shared/presentation/middlewares/auth.middleware';
import { logger } from '../../../../shared/utils/logger';
import { socketService } from '../../../../shared/infrastructure/socket/socket.service';
import Joi from 'joi';

// DTOs
interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface AssignSellerToSupervisorDto {
  sellerId: string;
  supervisorId: string;
}

interface AssignSupervisorToAdminDto {
  supervisorId: string;
  adminId: string;
}

const createUserDtoSchema = Joi.object<CreateUserDto>({
  name: Joi.string().min(3).max(255).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('SELLER', 'SUPERVISOR', 'ADMIN_GENERAL').required(),
});

const assignSellerToSupervisorDtoSchema = Joi.object<AssignSellerToSupervisorDto>({
  sellerId: Joi.string().uuid().required(),
  supervisorId: Joi.string().uuid().required(),
});

const assignSupervisorToAdminDtoSchema = Joi.object<AssignSupervisorToAdminDto>({
  supervisorId: Joi.string().uuid().required(),
  adminId: Joi.string().uuid().required(),
});

export class UserAdminController {
  public router: Router;
  private authService: AuthService;

  constructor() {
    this.router = Router();
    this.authService = new AuthService(new UserRepository());
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Create user (vendedor, supervisor, admin)
    this.router.post(
      '/',
      requireSuperAdmin,
      validateBody(createUserDtoSchema),
      this.createUser.bind(this)
    );

    // List all users
    this.router.get(
      '/',
      requireSuperAdmin,
      this.listUsers.bind(this)
    );

    // List users by role
    this.router.get(
      '/role/:role',
      requireSuperAdmin,
      this.listUsersByRole.bind(this)
    );

    // Assign seller to supervisor
    this.router.post(
      '/assign/seller-to-supervisor',
      requireSuperAdmin,
      validateBody(assignSellerToSupervisorDtoSchema),
      this.assignSellerToSupervisor.bind(this)
    );

    // Assign supervisor to admin
    this.router.post(
      '/assign/supervisor-to-admin',
      requireSuperAdmin,
      validateBody(assignSupervisorToAdminDtoSchema),
      this.assignSupervisorToAdmin.bind(this)
    );

    // Get supervisor's sellers (for supervisor dashboard) - MUST BE BEFORE /:id routes
    // Note: authMiddleware is already applied globally in app.module.ts
    this.router.get(
      '/supervisor/sellers',
      this.getSupervisorSellers.bind(this)
    );

    // Seller: own availability status
    this.router.get(
      '/sellers/me/availability',
      this.getMySellerAvailability.bind(this)
    );

    // Seller/Supervisor: set seller availability for round-robin
    this.router.put(
      '/sellers/:id/availability',
      this.updateSellerAvailability.bind(this)
    );

    // Delete user
    this.router.delete(
      '/:id',
      requireSuperAdmin,
      this.deleteUser.bind(this)
    );

    // Update seller brand
    this.router.put(
      '/sellers/:id/brand',
      requireSuperAdmin,
      this.updateSellerBrand.bind(this)
    );

    // Unassign seller from supervisor
    this.router.post(
      '/sellers/:id/unassign',
      requireSuperAdmin,
      this.unassignSellerFromSupervisor.bind(this)
    );

    // Get sellers with details (brand and supervisor)
    this.router.get(
      '/sellers/details',
      requireSuperAdmin,
      this.getSellersDetails.bind(this)
    );
  }

  /**
   * Create a new user (seller, supervisor, or admin)
   */
  private async createUser(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as CreateUserDto;

      logger.info('Creating new user', {
        email: dto.email,
        role: dto.role,
      });

      // Create user using AuthService
      const user = await this.authService.register({
        name: dto.name,
        email: dto.email,
        password: dto.password,
        role: dto.role,
      });

      // If role is SELLER, create Seller entity
      if (dto.role === UserRole.SELLER) {
        const sellerRepo = AppDataSource.getRepository(Seller);
        const seller = sellerRepo.create({
          id: user.id,
          brands: [], // Empty brands array initially
          roundRobinOrder: 0,
        });
        await sellerRepo.save(seller);
        logger.info('Seller entity created', { userId: user.id });
      }

      // If role is SUPERVISOR, create Supervisor entity
      if (dto.role === UserRole.SUPERVISOR) {
        const supervisorRepo = AppDataSource.getRepository(Supervisor);
        const supervisor = supervisorRepo.create({
          id: user.id,
          brands: [], // Empty brands array initially
        });
        await supervisorRepo.save(supervisor);
        logger.info('Supervisor entity created', { userId: user.id });
      }

      // Remove sensitive data
      const { passwordHash, ...userData } = user;

      res.status(201).json({
        success: true,
        data: userData,
        message: 'User created successfully',
      });
    } catch (error: any) {
      logger.error('Error creating user', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List all users
   */
  private async listUsers(req: Request, res: Response): Promise<void> {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const userRepo = AppDataSource.getRepository(User);
      const users = await userRepo.find({
        where: { active: true },
        order: { createdAt: 'DESC' },
      });

      res.json({
        success: true,
        users: users.map((user) => {
          const { passwordHash, ...userData } = user;
          return userData;
        }),
      });
    } catch (error: any) {
      logger.error('Error listing users', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List users by role
   */
  private async listUsersByRole(req: Request, res: Response): Promise<void> {
    try {
      const { role } = req.params;
      
      if (!Object.values(UserRole).includes(role as UserRole)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const userRepo = AppDataSource.getRepository(User);
      const users = await userRepo.find({
        where: { 
          role: role as UserRole,
          active: true,
        },
        order: { createdAt: 'DESC' },
      });

      res.json({
        success: true,
        users: users.map((user) => {
          const { passwordHash, ...userData } = user;
          return userData;
        }),
      });
    } catch (error: any) {
      logger.error('Error listing users by role', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Assign seller to supervisor
   */
  private async assignSellerToSupervisor(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as AssignSellerToSupervisorDto;

      logger.info('Assigning seller to supervisor', {
        sellerId: dto.sellerId,
        supervisorId: dto.supervisorId,
      });

      // Verify seller exists and has SELLER role
      const userRepo = AppDataSource.getRepository(User);
      const sellerUser = await userRepo.findOne({
        where: { id: dto.sellerId },
      });

      if (!sellerUser || sellerUser.role !== UserRole.SELLER) {
        res.status(404).json({ error: 'Seller not found' });
        return;
      }

      // Verify supervisor exists and has SUPERVISOR role
      const supervisorUser = await userRepo.findOne({
        where: { id: dto.supervisorId },
      });

      if (!supervisorUser || supervisorUser.role !== UserRole.SUPERVISOR) {
        res.status(404).json({ error: 'Supervisor not found' });
        return;
      }

      // Get seller entity with supervisors (N:N) to add novo vínculo
      const sellerRepo = AppDataSource.getRepository(Seller);
      const seller = await sellerRepo.findOne({
        where: { id: dto.sellerId },
        relations: ['supervisors'],
      });

      if (!seller) {
        res.status(404).json({ error: 'Seller entity not found' });
        return;
      }

      // Check if seller has a brand defined (not empty or undefined)
      if (!seller.brands || seller.brands.length === 0) {
        res.status(400).json({ error: 'Vendedor deve ter uma marca definida antes de ser atribuído a um supervisor' });
        return;
      }

      const supervisorRepo = AppDataSource.getRepository(Supervisor);
      const supervisorEntity = await supervisorRepo.findOne({
        where: { id: dto.supervisorId },
      });
      if (!supervisorEntity) {
        res.status(404).json({ error: 'Supervisor entity not found' });
        return;
      }

      // Adicionar à tabela N:N (vários supervisores podem ver o mesmo vendedor)
      if (!seller.supervisors) seller.supervisors = [];
      if (!seller.supervisors.some((s) => s.id === dto.supervisorId)) {
        seller.supervisors.push(supervisorEntity);
      }
      seller.supervisorId = dto.supervisorId; // mantido como "principal" para roteamento
      await sellerRepo.save(seller);

      logger.info('Seller assigned to supervisor successfully', {
        sellerId: dto.sellerId,
        supervisorId: dto.supervisorId,
      });

      res.json({
        success: true,
        message: 'Seller assigned to supervisor successfully',
        data: {
          sellerId: dto.sellerId,
          supervisorId: dto.supervisorId,
        },
      });
    } catch (error: any) {
      logger.error('Error assigning seller to supervisor', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Assign supervisor to admin
   */
  private async assignSupervisorToAdmin(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as AssignSupervisorToAdminDto;

      logger.info('Assigning supervisor to admin', {
        supervisorId: dto.supervisorId,
        adminId: dto.adminId,
      });

      // Verify supervisor exists and has SUPERVISOR role
      const userRepo = AppDataSource.getRepository(User);
      const supervisorUser = await userRepo.findOne({
        where: { id: dto.supervisorId },
      });

      if (!supervisorUser || supervisorUser.role !== UserRole.SUPERVISOR) {
        res.status(404).json({ error: 'Supervisor not found' });
        return;
      }

      // Verify admin exists and has ADMIN_GENERAL role
      const adminUser = await userRepo.findOne({
        where: { id: dto.adminId },
      });

      if (!adminUser || adminUser.role !== UserRole.ADMIN_GENERAL) {
        res.status(404).json({ error: 'Admin not found' });
        return;
      }

      // Update supervisor's adminId
      const supervisorRepo = AppDataSource.getRepository(Supervisor);
      const supervisor = await supervisorRepo.findOne({
        where: { id: dto.supervisorId },
      });

      if (!supervisor) {
        res.status(404).json({ error: 'Supervisor entity not found' });
        return;
      }

      // Update adminId
      supervisor.adminId = dto.adminId;
      await supervisorRepo.save(supervisor);

      logger.info('Supervisor assigned to admin successfully', {
        supervisorId: dto.supervisorId,
        adminId: dto.adminId,
      });

      res.json({
        success: true,
        message: 'Supervisor assigned to admin successfully',
        data: {
          supervisorId: dto.supervisorId,
          adminId: dto.adminId,
        },
      });
    } catch (error: any) {
      logger.error('Error assigning supervisor to admin', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete a user - limpa TODAS as referências antes de remover o usuário
   */
  private async deleteUser(req: Request, res: Response): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const { id } = req.params;

      logger.info('Deleting user', { userId: id });

      const userRepo = queryRunner.manager.getRepository(User);
      const user = await userRepo.findOne({ where: { id } });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user.role === UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Cannot delete SUPER_ADMIN users' });
        return;
      }

      await queryRunner.startTransaction();

      // 1. Limpar referências em todas as tabelas que apontam para users
      await queryRunner.query(
        'UPDATE seller_routing_state SET last_assigned_seller_id = NULL WHERE last_assigned_seller_id = $1',
        [id]
      );
      await queryRunner.query(
        'UPDATE client_seller_history SET seller_id = NULL WHERE seller_id = $1',
        [id]
      );
      await queryRunner.query(
        'UPDATE client_seller_history SET supervisor_id = NULL WHERE supervisor_id = $1',
        [id]
      );
      await queryRunner.query(
        'UPDATE whatsapp_numbers SET seller_id = NULL WHERE seller_id = $1',
        [id]
      );
      await queryRunner.query(
        'UPDATE quote_requests SET seller_id = NULL WHERE seller_id = $1',
        [id]
      );

      // 2. Atendimentos
      await queryRunner.query(
        'UPDATE attendances SET seller_id = NULL, active_seller_id = NULL WHERE seller_id = $1 OR active_seller_id = $1',
        [id]
      );
      await queryRunner.query(
        'UPDATE attendances SET supervisor_id = NULL WHERE supervisor_id = $1',
        [id]
      );

      // 2b. Purchases tem FK RESTRICT - precisa deletar antes (seller_id não é nullable)
      await queryRunner.query('DELETE FROM purchases WHERE seller_id = $1', [id]);

      // 3. Remover entidades específicas (Seller, Supervisor ou Admin) ANTES do User
      if (user.role === UserRole.SELLER) {
        await queryRunner.query('DELETE FROM seller_supervisors WHERE seller_id = $1', [id]);
        await queryRunner.query('DELETE FROM sellers WHERE id = $1', [id]);
      } else if (user.role === UserRole.SUPERVISOR) {
        await queryRunner.query('DELETE FROM seller_supervisors WHERE supervisor_id = $1', [id]);
        await queryRunner.query('UPDATE sellers SET supervisor_id = NULL WHERE supervisor_id = $1', [id]);
        await queryRunner.query('DELETE FROM supervisors WHERE id = $1', [id]);
      } else if (user.role === UserRole.ADMIN_GENERAL) {
        await queryRunner.query('UPDATE supervisors SET admin_id = NULL WHERE admin_id = $1', [id]);
      }

      // 4. Deletar notificações e message_reads (CASCADE pode falhar em algumas configs)
      await queryRunner.query('DELETE FROM notifications WHERE user_id = $1', [id]);
      await queryRunner.query('DELETE FROM message_reads WHERE user_id = $1', [id]);

      // 5. Por último: deletar o usuário
      await queryRunner.query('DELETE FROM users WHERE id = $1', [id]);

      await queryRunner.commitTransaction();
      logger.info('User deleted successfully', { userId: id });

      res.json({
        success: true,
        message: 'User deleted successfully',
        userId: id,
      });
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      logger.error('Error deleting user', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get sellers assigned to the current supervisor
   */
  private async getSupervisorSellers(req: Request, res: Response): Promise<void> {
    try {
      // Get supervisor ID from JWT token (user.sub from auth middleware - JWT standard uses 'sub' for subject/user ID)
      const supervisorId = (req as any).user?.sub;

      logger.info('getSupervisorSellers called', {
        hasUser: !!((req as any).user),
        userId: supervisorId,
        authorization: req.headers.authorization ? 'present' : 'missing',
      });

      if (!supervisorId) {
        logger.warn('getSupervisorSellers: No supervisor ID found', {
          user: (req as any).user,
          headers: Object.keys(req.headers),
        });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Verify supervisor exists and has SUPERVISOR role
      const userRepo = AppDataSource.getRepository(User);
      const supervisorUser = await userRepo.findOne({
        where: { id: supervisorId },
      });

      if (!supervisorUser || supervisorUser.role !== UserRole.SUPERVISOR) {
        res.status(403).json({ error: 'User is not a supervisor' });
        return;
      }

      // Get supervisor entity with brands
      const supervisorRepo = AppDataSource.getRepository(Supervisor);
      const supervisor = await supervisorRepo.findOne({
        where: { id: supervisorId },
      });

      if (!supervisor) {
        res.status(404).json({ error: 'Supervisor entity not found' });
        return;
      }

      // Vendedores vinculados por seller_supervisors (N:N)
      const sellerRepo = AppDataSource.getRepository(Seller);
      let sellers = await getSellersBySupervisorId(sellerRepo, supervisorId as string);
      sellers = sellers.filter((s) => s.user?.active !== false);

      // Format sellers response - garantir que brands seja sempre um array
      const sellersResponse = sellers.map((seller) => {
        const unavailableUntilIso = seller.unavailableUntil ? new Date(seller.unavailableUntil).toISOString() : null;
        const isUnavailable = !!(seller.unavailableUntil && new Date(seller.unavailableUntil).getTime() > Date.now());
        return {
          id: seller.id,
          name: seller.user.name,
          email: seller.user.email,
          brands: Array.isArray(seller.brands) ? seller.brands : [],
          isUnavailable,
          unavailableUntil: unavailableUntilIso,
        };
      });

      logger.info('getSupervisorSellers: returning sellers', {
        supervisorId,
        sellersCount: sellersResponse.length,
        sellers: sellersResponse.map(s => ({ id: s.id, name: s.name, brands: s.brands }))
      });

      res.json({
        success: true,
        supervisor: {
          id: supervisor.id,
          brands: supervisor.brands,
        },
        sellers: sellersResponse,
      });
    } catch (error: any) {
      logger.error('Error getting supervisor sellers', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Retorna disponibilidade do vendedor logado.
   */
  private async getMySellerAvailability(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.sub as string | undefined;
      const userRole = (req as any).user?.role as UserRole | undefined;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (userRole !== UserRole.SELLER) {
        res.status(403).json({ error: 'Only sellers can access this endpoint' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);
      const seller = await sellerRepo.findOne({ where: { id: userId } });

      if (!seller) {
        res.status(404).json({ error: 'Vendedor não encontrado' });
        return;
      }

      const unavailableUntilIso = seller.unavailableUntil ? new Date(seller.unavailableUntil).toISOString() : null;
      const isUnavailable = !!(seller.unavailableUntil && new Date(seller.unavailableUntil).getTime() > Date.now());

      res.json({
        success: true,
        sellerId: seller.id,
        isUnavailable,
        unavailableUntil: unavailableUntilIso,
      });
    } catch (error: any) {
      logger.error('Error getting seller availability', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Define vendedor como ausente (2h) ou presente.
   * SELLER só pode alterar o próprio status.
   * SUPERVISOR só pode alterar vendedores vinculados a ele.
   */
  private async updateSellerAvailability(req: Request, res: Response): Promise<void> {
    try {
      const requesterId = (req as any).user?.sub as string | undefined;
      const requesterRole = (req as any).user?.role as UserRole | undefined;
      const sellerId = req.params.id;
      const absent = !!req.body?.absent;

      if (!requesterId || !requesterRole) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);

      if (requesterRole === UserRole.SELLER) {
        if (requesterId !== sellerId) {
          res.status(403).json({ error: 'Seller can only update own availability' });
          return;
        }
      } else if (requesterRole === UserRole.SUPERVISOR) {
        const count = await sellerRepo
          .createQueryBuilder('seller')
          .innerJoin('seller.supervisors', 'sup')
          .where('seller.id = :sellerId', { sellerId })
          .andWhere('sup.id = :supervisorId', { supervisorId: requesterId })
          .getCount();
        if (count === 0) {
          res.status(403).json({ error: 'Supervisor cannot update this seller' });
          return;
        }
      } else if (requesterRole !== UserRole.SUPER_ADMIN && requesterRole !== UserRole.ADMIN_GENERAL) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const seller = await sellerRepo.findOne({ where: { id: sellerId } });
      if (!seller) {
        res.status(404).json({ error: 'Vendedor não encontrado' });
        return;
      }

      if (absent) {
        const unavailableUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
        seller.unavailableUntil = unavailableUntil;
      } else {
        seller.unavailableUntil = null;
      }

      await sellerRepo.save(seller);

      const unavailableUntilIso = seller.unavailableUntil ? new Date(seller.unavailableUntil).toISOString() : null;
      const isUnavailable = !!(seller.unavailableUntil && new Date(seller.unavailableUntil).getTime() > Date.now());

      const payload = {
        sellerId: seller.id,
        isUnavailable,
        unavailableUntil: unavailableUntilIso,
        updatedBy: requesterId,
        updatedByRole: requesterRole,
      };

      // Emitir atualização em tempo real para vendedor e supervisores
      try {
        socketService.emitToRoom(`seller_${seller.id}`, 'seller:availability_updated', payload);
        socketService.emitToRoom('supervisors', 'seller:availability_updated', payload);
      } catch (socketError: any) {
        logger.warn('Error emitting seller availability update via Socket.IO', {
          error: socketError?.message,
        });
      }

      res.json({
        success: true,
        ...payload,
      });
    } catch (error: any) {
      logger.error('Error updating seller availability', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update seller brand
   */
  private async updateSellerBrand(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { brand } = req.body;

      if (!brand || (brand !== 'INDEFINIDO' && !Object.values(VehicleBrand).includes(brand as VehicleBrand))) {
        res.status(400).json({ error: 'Marca inválida' });
        return;
      }

      const sellerRepo = AppDataSource.getRepository(Seller);
      const seller = await sellerRepo.findOne({
        where: { id },
      });

      if (!seller) {
        res.status(404).json({ error: 'Vendedor não encontrado' });
        return;
      }

      // If brand is INDEFINIDO, clear brands array and supervisorId
      if (brand === 'INDEFINIDO') {
        seller.brands = [];
        seller.supervisorId = null;
      } else {
        // Set single brand (sellers can only have one brand)
        seller.brands = [brand as VehicleBrand];
      }

      await sellerRepo.save(seller);

      logger.info('Seller brand updated', {
        sellerId: id,
        brand: brand === 'INDEFINIDO' ? null : brand,
      });

      res.json({
        success: true,
        message: 'Marca do vendedor atualizada com sucesso',
        data: {
          sellerId: id,
          brands: seller.brands,
        },
      });
    } catch (error: any) {
      logger.error('Error updating seller brand', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Unassign seller from supervisor (N:N).
   * Query ?supervisorId=uuid remove só esse vínculo; sem supervisorId remove todos os vínculos do vendedor.
   */
  private async unassignSellerFromSupervisor(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const supervisorId = (req.query.supervisorId as string) || (req.body?.supervisorId as string);

      const sellerRepo = AppDataSource.getRepository(Seller);
      const seller = await sellerRepo.findOne({
        where: { id },
        relations: ['supervisors'],
      });

      if (!seller) {
        res.status(404).json({ error: 'Vendedor não encontrado' });
        return;
      }

      if (!seller.supervisors) seller.supervisors = [];
      if (supervisorId) {
        seller.supervisors = seller.supervisors.filter((s) => s.id !== supervisorId);
        if (seller.supervisorId === supervisorId) {
          seller.supervisorId = seller.supervisors[0]?.id ?? undefined;
        }
      } else {
        seller.supervisors = [];
        seller.supervisorId = undefined;
      }
      await sellerRepo.save(seller);

      logger.info('Seller unassigned from supervisor', { sellerId: id, supervisorId: supervisorId || 'all' });

      res.json({
        success: true,
        message: supervisorId ? 'Vínculo removido com sucesso' : 'Vendedor desatribuído de todos os supervisores',
        data: { sellerId: id, supervisorId: supervisorId || null },
      });
    } catch (error: any) {
      logger.error('Error unassigning seller from supervisor', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get sellers with details (brand, supervisor principal e lista de supervisores N:N)
   */
  private async getSellersDetails(req: Request, res: Response): Promise<void> {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const sellerRepo = AppDataSource.getRepository(Seller);
      const sellers = await sellerRepo
        .createQueryBuilder('seller')
        .leftJoinAndSelect('seller.user', 'user')
        .leftJoinAndSelect('seller.supervisor', 'supervisor')
        .leftJoinAndSelect('seller.supervisors', 'supervisors')
        .leftJoinAndSelect('supervisors.user', 'supervisorUser')
        .where('user.role = :role', { role: UserRole.SELLER })
        .orderBy('user.name', 'ASC')
        .getMany();

      const sellersResponse = sellers.map((seller) => {
        const unavailableUntilIso = seller.unavailableUntil ? new Date(seller.unavailableUntil).toISOString() : null;
        const isUnavailable = !!(seller.unavailableUntil && new Date(seller.unavailableUntil).getTime() > Date.now());
        return {
          id: seller.id,
          name: seller.user.name,
          email: seller.user.email,
          active: seller.user.active,
          brands: seller.brands || [],
          isUnavailable,
          unavailableUntil: unavailableUntilIso,
          supervisorId: seller.supervisorId || null,
          supervisor: seller.supervisor
            ? { id: seller.supervisor.id, name: seller.supervisor.name, email: seller.supervisor.email }
            : null,
          supervisors: (seller.supervisors || []).map((s) => ({
            id: s.id,
            name: s.user?.name ?? (seller.supervisor?.id === s.id ? seller.supervisor.name : ''),
            email: s.user?.email ?? (seller.supervisor?.id === s.id ? seller.supervisor.email : ''),
          })),
          createdAt: seller.user.createdAt,
          updatedAt: seller.user.updatedAt,
        };
      });

      res.json({
        success: true,
        sellers: sellersResponse,
      });
    } catch (error: any) {
      logger.error('Error getting sellers details', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ error: error.message });
    }
  }
}
