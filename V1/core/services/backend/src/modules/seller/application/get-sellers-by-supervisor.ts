import { Repository } from 'typeorm';
import { Seller } from '../domain/entities/seller.entity';

/**
 * Retorna vendedores vinculados ao supervisor pela tabela N:N seller_supervisors
 * (vários supervisores podem ver os mesmos vendedores).
 */
export async function getSellersBySupervisorId(
  sellerRepo: Repository<Seller>,
  supervisorId: string,
  options?: { withUser?: boolean }
): Promise<Seller[]> {
  const qb = sellerRepo
    .createQueryBuilder('seller')
    .innerJoin('seller.supervisors', 'sup')
    .where('sup.id = :supervisorId', { supervisorId });
  if (options?.withUser !== false) {
    qb.leftJoinAndSelect('seller.user', 'user').orderBy('user.name', 'ASC');
  } else {
    qb.orderBy('seller.id', 'ASC');
  }
  return qb.getMany();
}
