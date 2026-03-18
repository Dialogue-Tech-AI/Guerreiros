import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  multiAgentService,
  SpecialistAgent,
  Router,
  RouterOutput,
  RouterType,
  DestinationType,
} from '../../services/multi-agent.service';
import { functionCallConfigService } from '../../services/ai-config.service';

const OPENAI_MODELS = [
  { id: 'gpt-4.1', label: 'GPT-4.1', desc: 'Mais capaz, código e instruções' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', desc: 'Rápido e eficiente (recomendado)' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano', desc: 'Mais rápido e econômico (correto)' },
  { id: 'gpt-4o', label: 'GPT-4o', desc: 'Flagship, multimodal' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', desc: 'Leve, multimodal' },
  { id: 'gpt-4o-nano', label: 'GPT-4o nano', desc: 'DEPRECADO - Use gpt-4.1-nano' },
  { id: 'gpt-5-nano', label: 'GPT-5 nano', desc: 'Próxima geração, máximo de economia' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: '128k contexto' },
  { id: 'gpt-4', label: 'GPT-4', desc: 'Modelo clássico' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', desc: 'Rápido, tarefas simples' },
] as const;

export const MultiAgentTab: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [universalPrompt, setUniversalPrompt] = useState<string>('');
  const [universalFunctionCalls, setUniversalFunctionCalls] = useState<string[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingUniversalPrompt, setIsSavingUniversalPrompt] = useState(false);
  const [isSavingUniversalFunctionCalls, setIsSavingUniversalFunctionCalls] = useState(false);

  // Specialists
  const [specialists, setSpecialists] = useState<SpecialistAgent[]>([]);
  const [isLoadingSpecialists, setIsLoadingSpecialists] = useState(true);
  const [showSpecialistModal, setShowSpecialistModal] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<SpecialistAgent | null>(null);
  const [availableFunctionCalls, setAvailableFunctionCalls] = useState<string[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);

  // Specialist form
  const [specialistName, setSpecialistName] = useState('');
  const [specialistPrompt, setSpecialistPrompt] = useState('');
  const [specialistModel, setSpecialistModel] = useState('gpt-4.1');
  const [specialistTemperature, setSpecialistTemperature] = useState(0.7);
  const [selectedFunctionCalls, setSelectedFunctionCalls] = useState<string[]>([]);
  const [specialistIsActive, setSpecialistIsActive] = useState(true);
  const [isSavingSpecialist, setIsSavingSpecialist] = useState(false);

  // Modular routers
  const [routers, setRouters] = useState<Router[]>([]);
  const [entryRouterId, setEntryRouterId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [isLoadingRouters, setIsLoadingRouters] = useState(false);
  const [showRouterModal, setShowRouterModal] = useState(false);
  const [editingRouter, setEditingRouter] = useState<Router | null>(null);
  const [routerOutputs, setRouterOutputs] = useState<RouterOutput[]>([]);
  const [mRouterName, setMRouterName] = useState('');
  const [mRouterDescription, setMRouterDescription] = useState('');
  const [mRouterType, setMRouterType] = useState<RouterType>('llm_choice');
  const [mRouterPrompt, setMRouterPrompt] = useState('');
  const [mRouterModel, setMRouterModel] = useState('gpt-4.1');
  const [mRouterTemperature, setMRouterTemperature] = useState(0.7);
  const [mRouterIsActive, setMRouterIsActive] = useState(true);
  const [isSavingRouterModal, setIsSavingRouterModal] = useState(false);
  // Output modal (for router outputs)
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [editingOutput, setEditingOutput] = useState<RouterOutput | null>(null);
  const [outputLabel, setOutputLabel] = useState('');
  const [outputDestinationType, setOutputDestinationType] = useState<DestinationType>('specialist');
  const [outputDestinationId, setOutputDestinationId] = useState<string | null>(null);
  const [outputResponseText, setOutputResponseText] = useState('');
  const [outputIsFallback, setOutputIsFallback] = useState(false);
  const [outputOrderIndex, setOutputOrderIndex] = useState(0);
  const [isSavingOutput, setIsSavingOutput] = useState(false);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);

  useEffect(() => {
    loadStatus();
    loadConfig();
    loadSpecialists();
    loadFunctionCalls();
    loadRouters();
  }, []);

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const status = await multiAgentService.getStatus();
      setIsEnabled(status.isEnabled);
      setUniversalPrompt(status.universalPrompt ?? '');
      setUniversalFunctionCalls(Array.isArray(status.universalFunctionCalls) ? status.universalFunctionCalls : []);
    } catch (error: any) {
      console.error('Error loading multi-agent status:', error);
      toast.error('Erro ao carregar status do multi-agentes');
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const loadConfig = async () => {
    try {
      const config = await multiAgentService.getConfig();
      setEntryRouterId(config.entryRouterId ?? null);
      setWorkflowId(config.workflowId ?? null);
    } catch (e) {
      console.error('Error loading config (entryRouterId):', e);
    }
  };

  const loadRouters = async () => {
    setIsLoadingRouters(true);
    try {
      const list = await multiAgentService.getRouters();
      setRouters(list);
    } catch (error: any) {
      console.error('Error loading routers:', error);
      toast.error('Erro ao carregar roteadores');
    } finally {
      setIsLoadingRouters(false);
    }
  };

  const loadSpecialists = async () => {
    setIsLoadingSpecialists(true);
    try {
      const data = await multiAgentService.getSpecialists();
      setSpecialists(data);
    } catch (error: any) {
      console.error('Error loading specialists:', error);
      toast.error('Erro ao carregar agentes especialistas');
    } finally {
      setIsLoadingSpecialists(false);
    }
  };

  const loadFunctionCalls = async () => {
    try {
      const configs = await functionCallConfigService.getAll();
      // configs is an array of FunctionCallConfig objects
      const activeFunctionCalls = configs
        .filter((config) => config.isActive !== false)
        .map((config) => config.functionCallName);
      setAvailableFunctionCalls(activeFunctionCalls);
    } catch (error: any) {
      console.error('Error loading function calls:', error);
    }
  };

  const handleToggle = async () => {
    setIsSavingStatus(true);
    try {
      const newStatus = !isEnabled;
      if (newStatus && !entryRouterId && !workflowId) {
        toast.error(
          'Defina um workflow ativo na aba Workflow ou um roteador de entrada antes de ativar multi-agentes.'
        );
        setIsSavingStatus(false);
        return;
      }
      const status = await multiAgentService.toggle(newStatus);
      setIsEnabled(status.isEnabled);
      toast.success(
        status.isEnabled
          ? 'Multi-agentes ativado com sucesso!'
          : 'Multi-agentes desativado com sucesso!'
      );
    } catch (error: any) {
      console.error('Error toggling multi-agent:', error);
      toast.error(error.response?.data?.error || 'Erro ao alterar status do multi-agentes');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleOpenSpecialistModal = (specialist?: SpecialistAgent) => {
    setOpenDropdownId(null); // Fechar dropdown se estiver aberto
    setDropdownPosition(null);
    if (specialist) {
      setEditingSpecialist(specialist);
      setSpecialistName(specialist.name);
      setSpecialistPrompt(specialist.prompt);
      setSpecialistModel(specialist.model);
      setSpecialistTemperature(specialist.temperature);
      setSelectedFunctionCalls(specialist.functionCallNames || []);
      setSpecialistIsActive(specialist.isActive);
    } else {
      setEditingSpecialist(null);
      setSpecialistName('');
      setSpecialistPrompt('');
      setSpecialistModel('gpt-4.1');
      setSpecialistTemperature(0.7);
      setSelectedFunctionCalls([]);
      setSpecialistIsActive(false); // Sempre inativo ao criar (igual às saídas)
    }
    setShowSpecialistModal(true);
  };

  const handleCloseSpecialistModal = () => {
    setShowSpecialistModal(false);
    setEditingSpecialist(null);
    setSpecialistName('');
    setSpecialistPrompt('');
    setSpecialistModel('gpt-4.1');
    setSpecialistTemperature(0.7);
    setSelectedFunctionCalls([]);
    setSpecialistIsActive(false);
  };

  const handleSaveSpecialist = async () => {
    if (!specialistName || specialistName.trim() === '') {
      toast.error('O nome do agente é obrigatório');
      return;
    }

    if (!specialistPrompt || specialistPrompt.trim() === '') {
      toast.error('O prompt do agente é obrigatório');
      return;
    }

    if (specialistPrompt.length < 1) {
      toast.error('O prompt deve ter pelo menos 1 caractere');
      return;
    }

    setIsSavingSpecialist(true);
    try {
      if (editingSpecialist) {
        await multiAgentService.updateSpecialist(editingSpecialist.id, {
          name: specialistName.trim(),
          prompt: specialistPrompt,
          model: specialistModel,
          temperature: specialistTemperature,
          functionCallNames: selectedFunctionCalls,
          isActive: specialistIsActive,
        });
        toast.success('Agente especialista atualizado com sucesso!');
      } else {
        await multiAgentService.createSpecialist({
          name: specialistName.trim(),
          prompt: specialistPrompt,
          model: specialistModel,
          temperature: specialistTemperature,
          functionCallNames: selectedFunctionCalls,
          isActive: false, // Sempre inativo ao criar; ativar pela lista após criar
        });
        toast.success('Agente criado (inativo). Ative-o pela lista quando quiser.');
      }
      handleCloseSpecialistModal();
      loadSpecialists();
    } catch (error: any) {
      console.error('Error saving specialist:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar agente especialista');
    } finally {
      setIsSavingSpecialist(false);
    }
  };

  const handleDeleteSpecialist = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja remover o agente "${name}"?`)) {
      return;
    }

    try {
      await multiAgentService.deleteSpecialist(id);
      toast.success('Agente especialista removido com sucesso!');
      loadSpecialists();
    } catch (error: any) {
      console.error('Error deleting specialist:', error);
      toast.error(error.response?.data?.error || 'Erro ao remover agente especialista');
    }
  };

  const handleToggleSpecialistActive = async (specialist: SpecialistAgent) => {
    try {
      await multiAgentService.updateSpecialist(specialist.id, {
        isActive: !specialist.isActive,
      });
      await loadSpecialists();
      toast.success(specialist.isActive ? 'Agente desativado' : 'Agente ativado');
    } catch (error: any) {
      console.error('Error toggling specialist active:', error);
      toast.error(error.response?.data?.error || 'Erro ao alterar status do agente');
    }
  };

  // ---------- Modular routers ----------
  const handleOpenRouterModal = async (router?: Router) => {
    if (router) {
      setEditingRouter(router);
      setMRouterName(router.name);
      setMRouterDescription(router.description ?? '');
      setMRouterType(router.routerType);
      setMRouterPrompt(router.prompt ?? '');
      setMRouterModel(router.model ?? 'gpt-4.1');
      setMRouterTemperature(router.temperature ?? 0.7);
      setMRouterIsActive(router.isActive);
      setIsLoadingOutputs(true);
      try {
        const outputs = await multiAgentService.getRouterOutputs(router.id);
        setRouterOutputs(outputs);
      } catch (e) {
        console.error('Error loading router outputs:', e);
        setRouterOutputs([]);
      } finally {
        setIsLoadingOutputs(false);
      }
    } else {
      setEditingRouter(null);
      setMRouterName('');
      setMRouterDescription('');
      setMRouterType('llm_choice');
      setMRouterPrompt('');
      setMRouterModel('gpt-4.1');
      setMRouterTemperature(0.7);
      setMRouterIsActive(true);
      setRouterOutputs([]);
    }
    setShowRouterModal(true);
  };

  const handleCloseRouterModal = () => {
    setShowRouterModal(false);
    setEditingRouter(null);
    setRouterOutputs([]);
  };

  const handleSaveRouterModal = async () => {
    if (!mRouterName?.trim()) {
      toast.error('Nome do roteador é obrigatório');
      return;
    }
    setIsSavingRouterModal(true);
    try {
      if (editingRouter) {
        await multiAgentService.updateRouter(editingRouter.id, {
          name: mRouterName.trim(),
          description: mRouterDescription.trim() || null,
          routerType: mRouterType,
          prompt: (mRouterType === 'llm_choice' || mRouterType === 'intent_channel') ? (mRouterPrompt.trim() || null) : null,
          model: (mRouterType === 'llm_choice' || mRouterType === 'intent_channel') ? mRouterModel : null,
          temperature: (mRouterType === 'llm_choice' || mRouterType === 'intent_channel') ? mRouterTemperature : null,
          isActive: mRouterIsActive,
        });
        toast.success('Roteador atualizado com sucesso!');
      } else {
        await multiAgentService.createRouter({
          name: mRouterName.trim(),
          description: mRouterDescription.trim() || null,
          routerType: mRouterType,
          prompt: (mRouterType === 'llm_choice' || mRouterType === 'intent_channel') ? (mRouterPrompt.trim() || null) : null,
          model: (mRouterType === 'llm_choice' || mRouterType === 'intent_channel') ? mRouterModel : null,
          temperature: (mRouterType === 'llm_choice' || mRouterType === 'intent_channel') ? mRouterTemperature : null,
          isActive: mRouterIsActive,
        });
        toast.success('Roteador criado com sucesso!');
      }
      handleCloseRouterModal();
      loadRouters();
    } catch (error: any) {
      console.error('Error saving router:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar roteador');
    } finally {
      setIsSavingRouterModal(false);
    }
  };

  const handleDeleteRouter = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja remover o roteador "${name}"?`)) return;
    try {
      await multiAgentService.deleteRouter(id);
      toast.success('Roteador removido com sucesso!');
      loadRouters();
      if (entryRouterId === id) {
        setEntryRouterId(null);
        try {
          await multiAgentService.setEntryRouter(null);
        } catch (_) {}
      }
    } catch (error: any) {
      console.error('Error deleting router:', error);
      toast.error(error.response?.data?.error || 'Erro ao remover roteador');
    }
  };

  const handleSetEntryRouter = async (routerId: string | null) => {
    try {
      await multiAgentService.setEntryRouter(routerId);
      setEntryRouterId(routerId);
      toast.success(routerId ? 'Roteador de entrada definido.' : 'Roteador de entrada removido.');
    } catch (error: any) {
      console.error('Error setting entry router:', error);
      toast.error(error.response?.data?.error || 'Erro ao definir roteador de entrada');
    }
  };

  const loadOutputsForRouter = async (routerId: string) => {
    try {
      const outputs = await multiAgentService.getRouterOutputs(routerId);
      setRouterOutputs(outputs);
    } catch (e) {
      console.error('Error loading outputs:', e);
    }
  };

  const openOutputModal = (output?: RouterOutput) => {
    if (output) {
      setEditingOutput(output);
      setOutputLabel(output.label);
      setOutputDestinationType(output.destinationType);
      setOutputDestinationId(output.destinationId ?? null);
      setOutputResponseText(output.responseText ?? '');
      setOutputIsFallback(output.isFallback);
      setOutputOrderIndex(output.orderIndex);
    } else {
      setEditingOutput(null);
      setOutputLabel('');
      setOutputDestinationType('specialist');
      setOutputDestinationId(null);
      setOutputResponseText('');
      setOutputIsFallback(false);
      setOutputOrderIndex(routerOutputs.length);
    }
    setShowOutputModal(true);
  };

  const closeOutputModal = () => {
    setShowOutputModal(false);
    setEditingOutput(null);
  };

  const handleSaveOutput = async () => {
    if (!editingRouter) return;
    if (!outputLabel.trim()) {
      toast.error('Label da saída é obrigatório');
      return;
    }
    if (outputDestinationType !== 'fixed' && !outputDestinationId) {
      toast.error('Selecione o destino (agente ou roteador)');
      return;
    }
    if (outputDestinationType === 'fixed' && !outputResponseText.trim()) {
      toast.error('Para destino fixo, informe o texto da resposta');
      return;
    }
    setIsSavingOutput(true);
    try {
      if (editingOutput) {
        await multiAgentService.updateRouterOutput(editingRouter.id, editingOutput.id, {
          label: outputLabel.trim(),
          destinationType: outputDestinationType,
          destinationId: outputDestinationType === 'fixed' ? null : outputDestinationId,
          responseText: outputDestinationType === 'fixed' ? outputResponseText.trim() : null,
          isFallback: outputIsFallback,
          orderIndex: outputOrderIndex,
        });
        toast.success('Saída atualizada.');
      } else {
        await multiAgentService.createRouterOutput(editingRouter.id, {
          label: outputLabel.trim(),
          destinationType: outputDestinationType,
          destinationId: outputDestinationType === 'fixed' ? null : outputDestinationId,
          responseText: outputDestinationType === 'fixed' ? outputResponseText.trim() : null,
          isFallback: outputIsFallback,
          orderIndex: outputOrderIndex,
        });
        toast.success('Saída adicionada.');
      }
      closeOutputModal();
      await loadOutputsForRouter(editingRouter.id);
    } catch (error: any) {
      console.error('Error saving output:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar saída');
    } finally {
      setIsSavingOutput(false);
    }
  };

  const handleDeleteOutput = async (routerId: string, outputId: string) => {
    if (!confirm('Remover esta saída?')) return;
    try {
      await multiAgentService.deleteRouterOutput(routerId, outputId);
      toast.success('Saída removida.');
      if (editingRouter && editingRouter.id === routerId) await loadOutputsForRouter(routerId);
    } catch (error: any) {
      console.error('Error deleting output:', error);
      toast.error(error.response?.data?.error || 'Erro ao remover saída');
    }
  };

  const toggleFunctionCall = (functionCallName: string) => {
    setSelectedFunctionCalls((prev) =>
      prev.includes(functionCallName)
        ? prev.filter((name) => name !== functionCallName)
        : [...prev, functionCallName]
    );
  };

  const handleSaveUniversalPrompt = async () => {
    setIsSavingUniversalPrompt(true);
    try {
      await multiAgentService.updateConfig({
        universalPrompt: universalPrompt.trim() || null,
      });
      toast.success('Prompt universal salvo com sucesso!');
    } catch (error: any) {
      console.error('Error saving universal prompt:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar prompt universal');
    } finally {
      setIsSavingUniversalPrompt(false);
    }
  };

  const toggleUniversalFunctionCall = (name: string) => {
    setUniversalFunctionCalls((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const handleSaveUniversalFunctionCalls = async () => {
    setIsSavingUniversalFunctionCalls(true);
    try {
      await multiAgentService.updateConfig({
        universalFunctionCalls: universalFunctionCalls.length ? universalFunctionCalls : null,
      });
      toast.success('Function calls universais salvas com sucesso!');
    } catch (error: any) {
      console.error('Error saving universal function calls', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar function calls universais');
    } finally {
      setIsSavingUniversalFunctionCalls(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Toggle Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: isEnabled ? '#DCFCE7' : '#FEE2E2' }}>
              <span className="material-icons-outlined" style={{ color: isEnabled ? '#16A34A' : '#DC2626' }}>
                account_tree
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900" style={{ color: '#0F172A' }}>
                {isEnabled ? 'Multi-Agentes Ativado' : 'Multi-Agentes Desativado'}
              </h3>
              <p className="text-sm text-slate-500" style={{ color: '#64748B' }}>
                {isEnabled
                  ? 'Sistema operando com Router Agent + Agentes Especialistas. Cada mensagem é roteada para o agente mais adequado.'
                  : 'Sistema usando apenas 1 agente único com prompt completo. Ative para usar arquitetura multi-agentes.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoadingStatus ? (
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <span className="material-icons-outlined text-slate-400 animate-spin text-lg">refresh</span>
                Carregando...
              </span>
            ) : isSavingStatus ? (
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <span className="material-icons-outlined text-slate-400 animate-spin text-lg">refresh</span>
                Salvando...
              </span>
            ) : (
              <>
                <span className="text-sm font-medium" style={{ color: isEnabled ? '#16A34A' : '#64748B' }}>
                  Ativado
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={handleToggle}
                    className="sr-only peer"
                  />
                  <div
                    className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"
                    style={{ backgroundColor: isEnabled ? '#F07000' : '#E2E8F0' }}
                  />
                </label>
                <span className="text-sm font-medium" style={{ color: !isEnabled ? '#DC2626' : '#64748B' }}>
                  Desativado
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {isEnabled && (
        <>
          {/* Prompt Universal Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E0F2FE' }}>
                  <span className="material-icons-outlined" style={{ color: '#0284C7' }}>public</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                    Prompt Universal
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                    Parte do prompt usada em todos os agentes especialistas. O prompt individual de cada agente é concatenado após este bloco.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Prompt Universal
                </label>
                <textarea
                  value={universalPrompt}
                  onChange={(e) => setUniversalPrompt(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y min-h-[180px]"
                  placeholder="Ex.: Você é um assistente da empresa X. Seja educado e objetivo. ..."
                />
                <p className="text-xs text-slate-500 mt-2" style={{ color: '#64748B' }}>
                  {universalPrompt.length} caracteres. Opcional; deixe em branco para não usar prompt universal.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveUniversalPrompt}
                  disabled={isSavingUniversalPrompt}
                  className="px-6 py-3 rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-white"
                  style={{ backgroundColor: '#0284C7' }}
                >
                  {isSavingUniversalPrompt ? (
                    <>
                      <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-outlined text-lg">save</span>
                      Salvar Prompt Universal
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Function Calls Universais Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                  <span className="material-icons-outlined" style={{ color: '#D97706' }}>extension</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                    Function Calls Universais
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                    Function calls que ficam presentes em todos os agentes especialistas. As do agente individual são somadas depois (sem duplicatas).
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Function calls em todos os agentes
                </label>
                {availableFunctionCalls.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Nenhuma function call ativa cadastrada. Configure em Configurações da IA → Function Calls.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {availableFunctionCalls.map((name) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={universalFunctionCalls.includes(name)}
                          onChange={() => toggleUniversalFunctionCall(name)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-2" style={{ color: '#64748B' }}>
                  {universalFunctionCalls.length} selecionada(s). Essas ferramentas estarão disponíveis em todos os especialistas.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveUniversalFunctionCalls}
                  disabled={isSavingUniversalFunctionCalls || availableFunctionCalls.length === 0}
                  className="px-6 py-3 rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-white"
                  style={{ backgroundColor: '#D97706' }}
                >
                  {isSavingUniversalFunctionCalls ? (
                    <>
                      <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-outlined text-lg">save</span>
                      Salvar Function Calls Universais
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Entry Router (modular) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E0E7FF' }}>
                  <span className="material-icons-outlined" style={{ color: '#4F46E5' }}>login</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                    Roteador de entrada
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                    Selecione o roteador que receberá as mensagens primeiro. Se vazio, multi-agentes não fará roteamento até que um roteador seja definido.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                Roteador de entrada
              </label>
              <select
                value={entryRouterId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleSetEntryRouter(v === '' ? null : v);
                }}
                className="w-full max-w-md px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Nenhum</option>
                {routers.filter((r) => r.isActive).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.description ? ` — ${r.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>


          {/* Roteadores (modular) Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E0E7FF' }}>
                    <span className="material-icons-outlined" style={{ color: '#4F46E5' }}>account_tree</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                      Roteadores
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                      Roteadores modulares: cada um pode encaminhar para especialistas ou outros roteadores. Defina o roteador de entrada acima.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenRouterModal()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white"
                  style={{ backgroundColor: '#4F46E5' }}
                >
                  <span className="material-icons-outlined text-lg">add</span>
                  Criar Roteador
                </button>
              </div>
            </div>
            <div className="p-6">
              {isLoadingRouters ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
                  <span className="ml-2 text-sm text-slate-500">Carregando...</span>
                </div>
              ) : routers.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-icons-outlined text-slate-400 text-6xl mb-4">account_tree</span>
                  <p className="text-slate-500 mb-4" style={{ color: '#64748B' }}>
                    Nenhum roteador modular configurado
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenRouterModal()}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: '#4F46E5' }}
                  >
                    Criar Primeiro Roteador
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>Nome</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>Descrição</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>Tipo</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>Status</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routers.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                          <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-white" style={{ color: '#0F172A' }}>{r.name}</td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400" style={{ color: '#475569' }}>{r.description || '—'}</td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400" style={{ color: '#475569' }}>
                            {r.routerType === 'llm_choice' ? 'LLM (escolha)' : r.routerType === 'intent_channel' ? 'Intent/Canal' : r.routerType}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-3 py-1.5 text-xs font-medium rounded-lg ${r.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                              {r.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenRouterModal(r)}
                                className="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg"
                                title="Editar"
                              >
                                <span className="material-icons-outlined text-lg">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRouter(r.id, r.name)}
                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                title="Remover"
                              >
                                <span className="material-icons-outlined text-lg">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Specialists Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEE4E2' }}>
                    <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>groups</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                      Agentes Especialistas
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                      Configure agentes especializados para diferentes áreas de atendimento
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenSpecialistModal()}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                  style={{ backgroundColor: '#F07000' }}
                >
                  <span className="material-icons-outlined text-lg">add</span>
                  Criar Agente
                </button>
              </div>
            </div>
            <div className="p-6">
              {isLoadingSpecialists ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
                  <span className="ml-2 text-sm text-slate-500">Carregando...</span>
                </div>
              ) : specialists.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-icons-outlined text-slate-400 text-6xl mb-4">groups</span>
                  <p className="text-slate-500 mb-4" style={{ color: '#64748B' }}>
                    Nenhum agente especialista configurado
                  </p>
                  <button
                    onClick={() => handleOpenSpecialistModal()}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: '#F07000' }}
                  >
                    Criar Primeiro Agente
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                          Nome
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                          Modelo
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                          Temperatura
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                          Function Calls
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                          Status
                        </th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {specialists.map((specialist) => (
                        <tr key={specialist.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                          <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-white" style={{ color: '#0F172A' }}>
                            {specialist.name}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400" style={{ color: '#475569' }}>
                            {specialist.model}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400" style={{ color: '#475569' }}>
                            {specialist.temperature}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400" style={{ color: '#475569' }}>
                            {specialist.functionCallNames?.length || 0} função(ões)
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleSpecialistActive(specialist)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                specialist.isActive
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                              title={specialist.isActive ? 'Desativar' : 'Ativar'}
                            >
                              {specialist.isActive ? 'Ativo' : 'Inativo'}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const button = e.currentTarget;
                                    const rect = button.getBoundingClientRect();
                                    if (openDropdownId === specialist.id) {
                                      setOpenDropdownId(null);
                                      setDropdownPosition(null);
                                    } else {
                                      const right = window.innerWidth - rect.right;
                                      const DROPDOWN_HEIGHT_ESTIMATE = 220;
                                      const margin = 16;
                                      const spaceBelow = window.innerHeight - rect.bottom - margin;
                                      const openAbove = spaceBelow < DROPDOWN_HEIGHT_ESTIMATE;
                                      let top = openAbove
                                        ? rect.top - DROPDOWN_HEIGHT_ESTIMATE - 4
                                        : rect.bottom + 4;
                                      top = Math.max(8, Math.min(top, window.innerHeight - DROPDOWN_HEIGHT_ESTIMATE - 8));
                                      setOpenDropdownId(specialist.id);
                                      setDropdownPosition({ top, right });
                                    }
                                  }}
                                  className="p-2 text-slate-600 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                  style={{ color: '#475569' }}
                                  title="Configurar agente"
                                >
                                  <span className="material-icons-outlined text-lg">more_vert</span>
                                </button>
                              </div>
                            </div>
                            {openDropdownId === specialist.id && dropdownPosition && (
                              <>
                                <div
                                  className="fixed inset-0 z-[100]"
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    setDropdownPosition(null);
                                  }}
                                />
                                <div 
                                  className="fixed w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-[101] py-1 max-h-[min(220px,70vh)] overflow-y-auto"
                                  style={{
                                    top: `${dropdownPosition.top}px`,
                                    right: `${dropdownPosition.right}px`,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSpecialistModal(specialist);
                                      setOpenDropdownId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                                  >
                                    <span className="material-icons-outlined text-lg">edit</span>
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleSpecialistActive(specialist);
                                      setOpenDropdownId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                                  >
                                    <span className="material-icons-outlined text-lg">
                                      {specialist.isActive ? 'toggle_on' : 'toggle_off'}
                                    </span>
                                    {specialist.isActive ? 'Desativar' : 'Ativar'}
                                  </button>
                                  <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSpecialist(specialist.id, specialist.name);
                                      setOpenDropdownId(null);
                                      setDropdownPosition(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                  >
                                    <span className="material-icons-outlined text-lg">delete</span>
                                    Remover
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Specialist Modal */}
      {showSpecialistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseSpecialistModal}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                  {editingSpecialist ? 'Editar Agente Especialista' : 'Criar Agente Especialista'}
                </h3>
                <button
                  onClick={handleCloseSpecialistModal}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <span className="material-icons-outlined">close</span>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Nome do Agente <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={specialistName}
                  onChange={(e) => setSpecialistName(e.target.value)}
                  placeholder="Ex: Vendas, Pós-venda, Garantia"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  disabled={!!editingSpecialist}
                />
                <p className="text-xs text-slate-500 mt-1" style={{ color: '#64748B' }}>
                  Nome único que identifica este agente especialista
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Prompt do Agente <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={specialistPrompt}
                  onChange={(e) => setSpecialistPrompt(e.target.value)}
                  placeholder="Configure o prompt específico para este agente especialista..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y min-h-[300px]"
                />
                <p className={`text-xs mt-1 ${specialistPrompt.length >= 1 ? 'text-slate-500' : 'text-amber-600 dark:text-amber-400 font-medium'}`} style={specialistPrompt.length >= 1 ? { color: '#64748B' } : undefined}>
                  {specialistPrompt.length} caracteres (mínimo: 1){specialistPrompt.length < 1 && ' — preencha para habilitar o botão Criar Agente'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                    Modelo <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={specialistModel}
                    onChange={(e) => setSpecialistModel(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    {OPENAI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                    Temperatura <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={specialistTemperature}
                    onChange={(e) => setSpecialistTemperature(parseFloat(e.target.value) || 0.7)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Function Calls Disponíveis
                </label>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 max-h-[200px] overflow-y-auto bg-slate-50 dark:bg-slate-800">
                  {availableFunctionCalls.length === 0 ? (
                    <p className="text-sm text-slate-500" style={{ color: '#64748B' }}>
                      Nenhuma function call ativa disponível
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {availableFunctionCalls.map((fcName) => (
                        <label key={fcName} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={selectedFunctionCalls.includes(fcName)}
                            onChange={() => toggleFunctionCall(fcName)}
                            className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                            style={{ accentColor: '#F07000' }}
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                            {fcName}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1" style={{ color: '#64748B' }}>
                  Selecione as function calls que este agente pode usar. Deixe vazio se o agente não usar tools.
                </p>
              </div>

              {!editingSpecialist && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <span className="material-icons-outlined text-amber-600 dark:text-amber-400 text-lg">info</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Novo agente será criado como inativo</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Após criar, use o botão &quot;Ativo&quot;/&quot;Inativo&quot; na lista para ativar o agente.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseSpecialistModal}
                  className="flex-1 px-4 py-2.5 border-2 border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  style={{ color: '#475569' }}
                  disabled={isSavingSpecialist}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSpecialist}
                  disabled={isSavingSpecialist || !specialistName?.trim() || !specialistPrompt?.trim() || specialistPrompt.length < 1}
                  title={
                    isSavingSpecialist
                      ? 'Salvando...'
                      : !specialistName?.trim()
                        ? 'Preencha o nome do agente'
                        : !specialistPrompt?.trim()
                          ? 'Preencha o prompt do agente'
                          : specialistPrompt.length < 1
                            ? 'O prompt precisa ter pelo menos 1 caractere'
                            : undefined
                  }
                  className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#F07000', opacity: isSavingSpecialist ? 0.7 : 1 }}
                >
                  {isSavingSpecialist ? (
                    <>
                      <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-outlined text-lg">save</span>
                      {editingSpecialist ? 'Salvar Alterações' : 'Criar Agente'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Roteador (modular) */}
      {showRouterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseRouterModal}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                  {editingRouter ? 'Editar Roteador' : 'Criar Roteador'}
                </h3>
                <button type="button" onClick={handleCloseRouterModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  <span className="material-icons-outlined">close</span>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>Nome <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={mRouterName}
                  onChange={(e) => setMRouterName(e.target.value)}
                  placeholder="Ex: Triagem, Compra"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  disabled={!!editingRouter}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>Descrição</label>
                <input
                  type="text"
                  value={mRouterDescription}
                  onChange={(e) => setMRouterDescription(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>Tipo de roteamento</label>
                <select
                  value={mRouterType}
                  onChange={(e) => setMRouterType(e.target.value as RouterType)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="llm_choice">LLM (escolha)</option>
                  <option value="intent_channel">Intent/Canal</option>
                  <option value="keyword">Palavras-chave</option>
                  <option value="condition">Condição</option>
                </select>
              </div>
              {(mRouterType === 'llm_choice' || mRouterType === 'intent_channel') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>Prompt</label>
                    <textarea
                      value={mRouterPrompt}
                      onChange={(e) => setMRouterPrompt(e.target.value)}
                      placeholder="Instrua o roteador sobre como classificar..."
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary outline-none resize-y min-h-[120px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>Modelo</label>
                      <select
                        value={mRouterModel}
                        onChange={(e) => setMRouterModel(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary"
                      >
                        {OPENAI_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>Temperatura</label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={mRouterTemperature}
                        onChange={(e) => setMRouterTemperature(parseFloat(e.target.value) || 0.7)}
                        className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mRouterActive"
                  checked={mRouterIsActive}
                  onChange={(e) => setMRouterIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <label htmlFor="mRouterActive" className="text-sm font-medium text-slate-700 dark:text-slate-300">Roteador ativo</label>
              </div>

              {editingRouter && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>Saídas</label>
                    <button
                      type="button"
                      onClick={() => openOutputModal()}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border text-indigo-600 border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    >
                      + Adicionar saída
                    </button>
                  </div>
                  {isLoadingOutputs ? (
                    <p className="text-sm text-slate-500">Carregando saídas...</p>
                  ) : routerOutputs.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhuma saída. Adicione ao menos uma (especialista, roteador ou resposta fixa).</p>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      {routerOutputs.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{o.label}</span>
                            <span className="ml-2 text-xs text-slate-500">
                              → {o.destinationType === 'specialist' && specialists.find(s => s.id === o.destinationId)?.name}
                              {o.destinationType === 'router' && routers.find(r => r.id === o.destinationId)?.name}
                              {o.destinationType === 'fixed' && '(resposta fixa)'}
                            </span>
                            {o.isFallback && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Fallback</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openOutputModal(o)} className="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg" title="Editar"><span className="material-icons-outlined text-lg">edit</span></button>
                            <button type="button" onClick={() => handleDeleteOutput(editingRouter.id, o.id)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Remover"><span className="material-icons-outlined text-lg">delete</span></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={handleCloseRouterModal} className="flex-1 px-4 py-2.5 border-2 border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" disabled={isSavingRouterModal}>Cancelar</button>
                <button type="button" onClick={handleSaveRouterModal} disabled={isSavingRouterModal || !mRouterName?.trim()} className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: '#4F46E5', opacity: isSavingRouterModal ? 0.7 : 1 }}>
                  {isSavingRouterModal ? <><span className="material-icons-outlined text-lg animate-spin">refresh</span> Salvando...</> : <><span className="material-icons-outlined text-lg">save</span> {editingRouter ? 'Salvar' : 'Criar Roteador'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Saída do Roteador */}
      {showOutputModal && editingRouter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={closeOutputModal}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
                  {editingOutput ? 'Editar saída' : 'Adicionar saída'}
                </h3>
                <button type="button" onClick={closeOutputModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><span className="material-icons-outlined">close</span></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Label <span className="text-red-500">*</span></label>
                <input type="text" value={outputLabel} onChange={(e) => setOutputLabel(e.target.value)} placeholder="Ex: Orçamento, Pós-venda" className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de destino</label>
                <select value={outputDestinationType} onChange={(e) => { setOutputDestinationType(e.target.value as DestinationType); setOutputDestinationId(null); setOutputResponseText(''); }} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary">
                  <option value="specialist">Agente especialista</option>
                  <option value="router">Outro roteador</option>
                  <option value="fixed">Resposta fixa</option>
                </select>
              </div>
              {outputDestinationType === 'specialist' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Agente</label>
                  <select value={outputDestinationId ?? ''} onChange={(e) => setOutputDestinationId(e.target.value === '' ? null : e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary">
                    <option value="">Selecione...</option>
                    {specialists.map((s) => <option key={s.id} value={s.id}>{s.name}{!s.isActive ? ' (Inativo)' : ''}</option>)}
                  </select>
                </div>
              )}
              {outputDestinationType === 'router' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Roteador</label>
                  <select value={outputDestinationId ?? ''} onChange={(e) => setOutputDestinationId(e.target.value === '' ? null : e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary">
                    <option value="">Selecione...</option>
                    {routers.filter((r) => r.id !== editingRouter.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {outputDestinationType === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Texto da resposta</label>
                  <textarea value={outputResponseText} onChange={(e) => setOutputResponseText(e.target.value)} placeholder="Resposta fixa ao usuário" className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary resize-y min-h-[80px]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ordem</label>
                <input type="number" min="0" value={outputOrderIndex} onChange={(e) => setOutputOrderIndex(parseInt(e.target.value, 10) || 0)} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="outputFallback" checked={outputIsFallback} onChange={(e) => setOutputIsFallback(e.target.checked)} className="rounded border-slate-300 text-primary focus:ring-primary" />
                <label htmlFor="outputFallback" className="text-sm font-medium text-slate-700 dark:text-slate-300">Usar como fallback</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeOutputModal} className="flex-1 px-4 py-2.5 border-2 border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" disabled={isSavingOutput}>Cancelar</button>
                <button type="button" onClick={handleSaveOutput} disabled={isSavingOutput || !outputLabel.trim() || (outputDestinationType !== 'fixed' && !outputDestinationId) || (outputDestinationType === 'fixed' && !outputResponseText.trim())} className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: '#4F46E5' }}>
                  {isSavingOutput ? <><span className="material-icons-outlined text-lg animate-spin">refresh</span> Salvando...</> : <><span className="material-icons-outlined text-lg">save</span> {editingOutput ? 'Salvar' : 'Adicionar'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
