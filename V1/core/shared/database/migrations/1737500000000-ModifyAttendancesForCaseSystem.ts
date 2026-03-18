import { MigrationInterface, QueryRunner, TableColumn, TableIndex, TableForeignKey } from 'typeorm';

export class ModifyAttendancesForCaseSystem1737500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create new enum types (only if they don't exist)
    // Note: TypeORM will create enum type automatically when using addColumn with enum type
    // The enum type name will be: {table}_{column}_enum (e.g., attendances_operational_state_enum)
    // So we don't need to create operational_state_enum manually
    
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE attendance_case_type_enum AS ENUM (
          'COMPRA',
          'GARANTIA',
          'TROCA',
          'ESTORNO',
          'OUTROS',
          'NAO_ATRIBUIDO'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE purchase_origin_enum AS ENUM (
          'WHATSAPP',
          'TELEFONE_FIXO',
          'ECOMMERCE',
          'BALCAO',
          'NAO_APLICA'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Check if column already exists (migration might have been partially executed)
    const columnExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'attendances' 
        AND column_name = 'operational_state';
    `);

    // Add new columns only if they don't exist
    if (columnExists.length === 0) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'operational_state',
          type: 'enum',
          enum: ['TRIAGEM', 'ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_VENDEDOR', 'FECHADO_OPERACIONAL'],
          isNullable: true, // Nullable initially for backward compatibility
        })
      );
    }

    // Add other columns only if they don't exist
    const checkColumn = async (columnName: string) => {
      const result = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
          AND table_name = 'attendances' 
          AND column_name = '` + columnName + `';
      `);
      return result.length > 0;
    };

    if (!(await checkColumn('is_finalized'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'is_finalized',
          type: 'boolean',
          default: false,
        })
      );
    }

    if (!(await checkColumn('is_attributed'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'is_attributed',
          type: 'boolean',
          default: true,
        })
      );
    }

    if (!(await checkColumn('attendance_type'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'attendance_type',
          type: 'enum',
          enum: ['COMPRA', 'GARANTIA', 'TROCA', 'ESTORNO', 'OUTROS', 'NAO_ATRIBUIDO'],
          isNullable: true,
        })
      );
    }

    if (!(await checkColumn('purchase_origin'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'purchase_origin',
          type: 'enum',
          enum: ['WHATSAPP', 'TELEFONE_FIXO', 'ECOMMERCE', 'BALCAO', 'NAO_APLICA'],
          isNullable: true,
        })
      );
    }

    if (!(await checkColumn('purchase_date'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'purchase_date',
          type: 'timestamp',
          isNullable: true,
        })
      );
    }

    if (!(await checkColumn('last_client_message_at'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'last_client_message_at',
          type: 'timestamp',
          isNullable: true,
        })
      );
    }

    if (!(await checkColumn('intention'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'intention',
          type: 'text',
          isNullable: true,
        })
      );
    }

    if (!(await checkColumn('related_attendance_id'))) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'related_attendance_id',
          type: 'uuid',
          isNullable: true,
        })
      );
    }

    // Get the actual enum type name from the column (after it's been created)
    // TypeORM creates it as: {table}_{column}_enum (e.g., attendances_operational_state_enum)
    const enumTypeResult = await queryRunner.query(`
      SELECT 
        c.udt_name as enum_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'attendances' 
        AND c.column_name = 'operational_state';
    `);
    
    if (enumTypeResult.length === 0 || !enumTypeResult[0].enum_name) {
      // Column doesn't exist or enum not found, skip migration
      return;
    }

    const enumTypeName = enumTypeResult[0].enum_name;

    // Migrate existing data: set operational_state based on state
    // Use the discovered enum type name
    try {
      await queryRunner.query(`
        UPDATE attendances 
        SET operational_state = CASE
          WHEN state = 'OPEN' THEN 'TRIAGEM'::` + enumTypeName + `
          WHEN state = 'IN_PROGRESS' THEN 'EM_ATENDIMENTO'::` + enumTypeName + `
          WHEN state = 'FINISHED' THEN 'FECHADO_OPERACIONAL'::` + enumTypeName + `
          ELSE 'TRIAGEM'::` + enumTypeName + `
        END
        WHERE operational_state IS NULL;
      `);
    } catch (error: any) {
      // Migration might have already been done, ignore if it's a type mismatch
      if (!error.message.includes('type') && !error.message.includes('cast')) {
        throw error;
      }
    }

    // Set default operational_state for new records
    try {
      await queryRunner.query(`
        ALTER TABLE attendances 
        ALTER COLUMN operational_state SET DEFAULT 'TRIAGEM'::` + enumTypeName + `;
      `);
    } catch (error: any) {
      // Default might already be set, ignore error
      if (!error.message.includes('already has a default')) {
        throw error;
      }
    }

    // Set NOT NULL only if column is still nullable
    try {
      const nullableCheck = await queryRunner.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'attendances'
          AND column_name = 'operational_state';
      `);
      
      if (nullableCheck.length > 0 && nullableCheck[0].is_nullable === 'YES') {
        await queryRunner.query(`
          ALTER TABLE attendances 
          ALTER COLUMN operational_state SET NOT NULL;
        `);
      }
    } catch (error: any) {
      // Column might already be NOT NULL, ignore
      if (!error.message.includes('already')) {
        throw error;
      }
    }

    // Create foreign key for related_attendance_id
    await queryRunner.createForeignKey(
      'attendances',
      new TableForeignKey({
        columnNames: ['related_attendance_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'attendances',
        onDelete: 'SET NULL',
      })
    );

    // Create indexes
    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'idx_attendance_operational_state',
        columnNames: ['operational_state'],
      })
    );

    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'idx_attendance_is_finalized',
        columnNames: ['is_finalized'],
      })
    );

    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'idx_attendance_related',
        columnNames: ['related_attendance_id'],
      })
    );

    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'idx_attendance_type',
        columnNames: ['attendance_type'],
      })
    );

    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'idx_attendance_client_operational',
        columnNames: ['client_phone', 'operational_state'],
      })
    );

    // Note: We keep the 'state' column for backward compatibility
    // It will be removed in a future migration after all code is updated
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('attendances', 'idx_attendance_client_operational');
    await queryRunner.dropIndex('attendances', 'idx_attendance_type');
    await queryRunner.dropIndex('attendances', 'idx_attendance_related');
    await queryRunner.dropIndex('attendances', 'idx_attendance_is_finalized');
    await queryRunner.dropIndex('attendances', 'idx_attendance_operational_state');

    // Drop foreign key
    const table = await queryRunner.getTable('attendances');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('related_attendance_id') !== -1
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('attendances', foreignKey);
    }

    // Drop columns
    await queryRunner.dropColumn('attendances', 'related_attendance_id');
    await queryRunner.dropColumn('attendances', 'intention');
    await queryRunner.dropColumn('attendances', 'last_client_message_at');
    await queryRunner.dropColumn('attendances', 'purchase_date');
    await queryRunner.dropColumn('attendances', 'purchase_origin');
    await queryRunner.dropColumn('attendances', 'attendance_type');
    await queryRunner.dropColumn('attendances', 'is_attributed');
    await queryRunner.dropColumn('attendances', 'is_finalized');
    await queryRunner.dropColumn('attendances', 'operational_state');

    // Drop enum types
    await queryRunner.query('DROP TYPE IF EXISTS purchase_origin_enum;');
    await queryRunner.query('DROP TYPE IF EXISTS attendance_case_type_enum;');
    await queryRunner.query('DROP TYPE IF EXISTS operational_state_enum;');
  }
}
