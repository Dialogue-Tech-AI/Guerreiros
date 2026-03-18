/**
 * Script para limpar contas antigas/orfãs que não foram deletadas corretamente.
 * Remove TODOS os usuários exceto SUPER_ADMIN, limpando todas as referências.
 *
 * Uso: npm run cleanup:users
 */
import { loadEnv } from '../../src/config/load-env';

// Carrega sempre o .env unificado com flags DEV/PROD
loadEnv();

import 'reflect-metadata';
import { AppDataSource } from '../../src/shared/infrastructure/database/typeorm/config/database.config';
import { User } from '../../src/modules/auth/domain/entities/user.entity';
import { UserRole } from '../../src/shared/types/common.types';

async function cleanupOrphanedUsers() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const usersToDelete = await userRepo.find({
    where: [{ role: UserRole.SELLER }, { role: UserRole.SUPERVISOR }, { role: UserRole.ADMIN_GENERAL }],
  });

  if (usersToDelete.length === 0) {
    console.log('✅ Nenhuma conta para limpar (exceto Super Admin).');
    await AppDataSource.destroy();
    process.exit(0);
    return;
  }

  console.log(`Encontradas ${usersToDelete.length} contas para remover: ${usersToDelete.map((u) => `${u.name} (${u.email})`).join(', ')}`);

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    for (const user of usersToDelete) {
      const id = user.id;

      // Limpar referências
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
      await queryRunner.query(
        'UPDATE attendances SET seller_id = NULL, active_seller_id = NULL WHERE seller_id = $1 OR active_seller_id = $1',
        [id]
      );
      await queryRunner.query(
        'UPDATE attendances SET supervisor_id = NULL WHERE supervisor_id = $1',
        [id]
      );
      await queryRunner.query('DELETE FROM purchases WHERE seller_id = $1', [id]);

      if (user.role === UserRole.SELLER) {
        await queryRunner.query('DELETE FROM sellers WHERE id = $1', [id]);
      } else if (user.role === UserRole.SUPERVISOR) {
        await queryRunner.query('UPDATE sellers SET supervisor_id = NULL WHERE supervisor_id = $1', [id]);
        await queryRunner.query('DELETE FROM supervisors WHERE id = $1', [id]);
      } else if (user.role === UserRole.ADMIN_GENERAL) {
        await queryRunner.query('UPDATE supervisors SET admin_id = NULL WHERE admin_id = $1', [id]);
      }

      await queryRunner.query('DELETE FROM notifications WHERE user_id = $1', [id]);
      await queryRunner.query('DELETE FROM message_reads WHERE user_id = $1', [id]);
      await queryRunner.query('DELETE FROM users WHERE id = $1', [id]);

      console.log(`  Removido: ${user.name} (${user.email})`);
    }

    await queryRunner.commitTransaction();
    console.log(`\n✅ ${usersToDelete.length} conta(s) removida(s) com sucesso.`);
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    console.error('Erro na limpeza:', error.message);
    throw error;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }

  process.exit(0);
}

cleanupOrphanedUsers().catch((e) => {
  console.error(e);
  process.exit(1);
});
