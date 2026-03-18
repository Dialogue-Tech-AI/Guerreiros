import React from 'react';
import { MainLayout } from '../../components/Layout/MainLayout';
import { useAuthStore } from '../../store/auth.store';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore();

  return (
    <MainLayout>
      <div className="p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Dashboard Administrativo
        </h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Bem-vindo, {user?.name}!</h2>
          <p className="text-gray-600">
            Visão geral completa de toda a operação. Gerencie usuários, visualize todos os atendimentos
            e acesse relatórios detalhados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-blue-50 rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-blue-900">Total Atendimentos</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">0</p>
          </div>

          <div className="bg-green-50 rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-green-900">Vendedores Ativos</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">0</p>
          </div>

          <div className="bg-purple-50 rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-purple-900">IA Atendendo</h3>
            <p className="text-3xl font-bold text-purple-600 mt-2">0</p>
          </div>

          <div className="bg-yellow-50 rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-yellow-900">Não Atribuídos</h3>
            <p className="text-3xl font-bold text-yellow-600 mt-2">0</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-4 border-2 border-blue-500 rounded-lg hover:bg-blue-50 transition">
              👥 Gerenciar Usuários
            </button>
            <button className="p-4 border-2 border-green-500 rounded-lg hover:bg-green-50 transition">
              📊 Relatórios
            </button>
            <button className="p-4 border-2 border-purple-500 rounded-lg hover:bg-purple-50 transition">
              💬 Todos os Atendimentos
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};
