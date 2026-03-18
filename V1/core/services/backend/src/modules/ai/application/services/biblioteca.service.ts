import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { BibliotecaPrompt } from '../../domain/entities/biblioteca-prompt.entity';
import { BibliotecaFunctionCall } from '../../domain/entities/biblioteca-function-call.entity';
import { BibliotecaFolder } from '../../domain/entities/biblioteca-folder.entity';
import { BibliotecaSchema as BibliotecaSchemaEntity } from '../../domain/entities/biblioteca-schema.entity';
import { AgentFunctionCall } from '../../domain/entities/agent-function-call.entity';
import { UUID } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';

export class BibliotecaService {
  private get promptRepository() {
    return AppDataSource.getRepository(BibliotecaPrompt);
  }
  
  private get functionCallRepository() {
    return AppDataSource.getRepository(BibliotecaFunctionCall);
  }
  
  private get folderRepository() {
    return AppDataSource.getRepository(BibliotecaFolder);
  }

  private get schemaRepository() {
    return AppDataSource.getRepository(BibliotecaSchemaEntity);
  }
  
  private get agentFunctionCallRepository() {
    return AppDataSource.getRepository(AgentFunctionCall);
  }

  // ========== PROMPTS ==========
  async getAllPrompts(): Promise<BibliotecaPrompt[]> {
    return this.promptRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getPromptById(id: UUID): Promise<BibliotecaPrompt | null> {
    return this.promptRepository.findOne({ where: { id } });
  }

  async createPrompt(data: {
    name: string;
    content: string;
    folderId?: UUID | null;
  }): Promise<BibliotecaPrompt> {
    const folderId = data.folderId === '' || data.folderId == null ? null : data.folderId;
    const prompt = this.promptRepository.create({
      name: data.name,
      content: data.content,
      folderId,
    });
    return this.promptRepository.save(prompt);
  }

  async updatePrompt(id: UUID, data: {
    name?: string;
    content?: string;
    folderId?: UUID | null;
  }): Promise<BibliotecaPrompt> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.folderId !== undefined) updateData.folderId = data.folderId === '' ? null : data.folderId;
    if (Object.keys(updateData).length === 0) {
      const existing = await this.promptRepository.findOne({ where: { id } });
      if (!existing) throw new Error('Prompt not found');
      return existing;
    }
    await this.promptRepository.update(id, updateData);
    const updated = await this.promptRepository.findOne({ where: { id } });
    if (!updated) throw new Error('Prompt not found');
    return updated;
  }

  async deletePrompt(id: UUID): Promise<void> {
    await this.promptRepository.delete(id);
  }

  // ========== FUNCTION CALLS ==========
  async getAllFunctionCalls(): Promise<BibliotecaFunctionCall[]> {
    return this.functionCallRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getFunctionCallById(id: UUID): Promise<BibliotecaFunctionCall | null> {
    return this.functionCallRepository.findOne({ where: { id } });
  }

  async createFunctionCall(data: {
    name: string;
    folderId?: UUID | null;
    objective?: string;
    triggerConditions?: string;
    executionTiming?: string;
    requiredFields?: string;
    optionalFields?: string;
    restrictions?: string;
    processingNotes?: string;
    isActive?: boolean;
    hasOutput?: boolean;
    processingMethod?: 'RABBITMQ' | 'HTTP';
    customAttributes?: Record<string, string>;
  }): Promise<BibliotecaFunctionCall> {
    const folderId = data.folderId === '' || data.folderId == null ? null : data.folderId;
    const fc = this.functionCallRepository.create({
      name: data.name,
      folderId,
      objective: data.objective || '',
      triggerConditions: data.triggerConditions || '',
      executionTiming: data.executionTiming || '',
      requiredFields: data.requiredFields || '',
      optionalFields: data.optionalFields || '',
      restrictions: data.restrictions || '',
      processingNotes: data.processingNotes || '',
      isActive: data.isActive ?? true,
      hasOutput: data.hasOutput ?? false,
      processingMethod: data.processingMethod || 'RABBITMQ',
      customAttributes: data.customAttributes || {},
    });
    return this.functionCallRepository.save(fc);
  }

  async updateFunctionCall(id: UUID, data: Partial<BibliotecaFunctionCall>): Promise<BibliotecaFunctionCall> {
    const payload = { ...data };
    if (payload.folderId === '') payload.folderId = null as unknown as UUID;
    await this.functionCallRepository.update(id, payload);
    const updated = await this.functionCallRepository.findOne({ where: { id } });
    if (!updated) throw new Error('Function call not found');
    return updated;
  }

  async deleteFunctionCall(id: UUID): Promise<void> {
    await this.functionCallRepository.delete(id);
  }

  // ========== FOLDERS ==========
  async getAllFolders(): Promise<BibliotecaFolder[]> {
    return this.folderRepository.find({
      order: { createdAt: 'ASC' },
    });
  }

  async getFolderById(id: UUID): Promise<BibliotecaFolder | null> {
    return this.folderRepository.findOne({ where: { id } });
  }

  async createFolder(data: {
    name: string;
    parentId?: UUID | null;
  }): Promise<BibliotecaFolder> {
    const parentId = data.parentId === '' || data.parentId == null ? null : data.parentId;
    const folder = this.folderRepository.create({
      name: data.name,
      parentId,
    });
    return this.folderRepository.save(folder);
  }

  async updateFolder(id: UUID, data: {
    name?: string;
    parentId?: UUID | null;
  }): Promise<BibliotecaFolder> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.parentId !== undefined) updateData.parentId = data.parentId === '' ? null : data.parentId;
    if (Object.keys(updateData).length === 0) {
      const existing = await this.folderRepository.findOne({ where: { id } });
      if (!existing) throw new Error('Folder not found');
      return existing;
    }
    await this.folderRepository.update(id, updateData);
    const updated = await this.folderRepository.findOne({ where: { id } });
    if (!updated) throw new Error('Folder not found');
    return updated;
  }

  async deleteFolder(id: UUID): Promise<void> {
    await this.folderRepository.delete(id);
  }

  // ========== SCHEMAS ==========
  async getAllSchemas(): Promise<BibliotecaSchemaEntity[]> {
    return this.schemaRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getSchemaById(id: UUID): Promise<BibliotecaSchemaEntity | null> {
    return this.schemaRepository.findOne({ where: { id } });
  }

  async createSchema(data: {
    name: string;
    folderId?: UUID | null;
    definition?: string | null;
    schemaType?: 'sem-tags' | 'com-tags' | null;
  }): Promise<BibliotecaSchemaEntity> {
    const folderId = data.folderId === '' || data.folderId == null ? null : data.folderId;
    const schema = this.schemaRepository.create({
      name: data.name,
      folderId,
      definition: data.definition ?? null,
      schemaType: data.schemaType ?? null,
    });
    return this.schemaRepository.save(schema);
  }

  async updateSchema(id: UUID, data: {
    name?: string;
    folderId?: UUID | null;
    definition?: string | null;
    schemaType?: 'sem-tags' | 'com-tags' | null;
  }): Promise<BibliotecaSchemaEntity> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.folderId !== undefined) updateData.folderId = data.folderId === '' ? null : data.folderId;
    if (data.definition !== undefined) updateData.definition = data.definition;
    if (data.schemaType !== undefined) updateData.schemaType = data.schemaType;
    if (Object.keys(updateData).length === 0) {
      const existing = await this.schemaRepository.findOne({ where: { id } });
      if (!existing) throw new Error('Schema not found');
      return existing;
    }
    await this.schemaRepository.update(id, updateData);
    const updated = await this.schemaRepository.findOne({ where: { id } });
    if (!updated) throw new Error('Schema not found');
    return updated;
  }

  async deleteSchema(id: UUID): Promise<void> {
    await this.schemaRepository.delete(id);
  }

  // ========== AGENT FUNCTION CALLS ==========
  async getAllAgentFunctionCalls(): Promise<AgentFunctionCall[]> {
    return this.agentFunctionCallRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getAgentFunctionCallById(id: UUID): Promise<AgentFunctionCall | null> {
    return this.agentFunctionCallRepository.findOne({ where: { id } });
  }

  async createAgentFunctionCall(data: {
    name: string;
    objective?: string;
    triggerConditions?: string;
    executionTiming?: string;
    requiredFields?: string;
    optionalFields?: string;
    restrictions?: string;
    processingNotes?: string;
    isActive?: boolean;
    hasOutput?: boolean;
    processingMethod?: 'RABBITMQ' | 'HTTP';
    customAttributes?: Record<string, string>;
    bibliotecaId?: UUID | null;
  }): Promise<AgentFunctionCall> {
    const bibliotecaId = data.bibliotecaId === '' || data.bibliotecaId == null ? null : data.bibliotecaId;
    const fc = this.agentFunctionCallRepository.create({
      name: data.name,
      objective: data.objective || '',
      triggerConditions: data.triggerConditions || '',
      executionTiming: data.executionTiming || '',
      requiredFields: data.requiredFields || '',
      optionalFields: data.optionalFields || '',
      restrictions: data.restrictions || '',
      processingNotes: data.processingNotes || '',
      isActive: data.isActive ?? true,
      hasOutput: data.hasOutput ?? false,
      processingMethod: data.processingMethod || 'RABBITMQ',
      customAttributes: data.customAttributes || {},
      bibliotecaId,
    });
    return this.agentFunctionCallRepository.save(fc);
  }

  async updateAgentFunctionCall(id: UUID, data: Partial<AgentFunctionCall>): Promise<AgentFunctionCall> {
    await this.agentFunctionCallRepository.update(id, data);
    const updated = await this.agentFunctionCallRepository.findOne({ where: { id } });
    if (!updated) throw new Error('Agent function call not found');
    return updated;
  }

  async deleteAgentFunctionCall(id: UUID): Promise<void> {
    await this.agentFunctionCallRepository.delete(id);
  }

  async saveAllAgentFunctionCalls(functionCalls: Partial<AgentFunctionCall>[]): Promise<AgentFunctionCall[]> {
    // Apaga todos os registros atuais antes de recriar.
    // Usar clear() em vez de delete({}) para evitar erro
    // "Empty criteria(s) are not allowed for the delete method."
    await this.agentFunctionCallRepository.clear();

    // Cria todos os novos registros de uma vez
    const created = this.agentFunctionCallRepository.create(functionCalls);
    return this.agentFunctionCallRepository.save(created);
  }
}

export const bibliotecaService = new BibliotecaService();
