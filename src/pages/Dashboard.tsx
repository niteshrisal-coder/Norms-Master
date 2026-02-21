import React, { useState, useEffect } from 'react';
import { LayoutDashboard, BookOpen, DollarSign, FolderKanban, TrendingUp, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { Norm, Rate, Project } from '../types';

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [stats, setStats] = useState({
    norms: 0,
    rates: 0,
    projects: 0,
    recentProjects: [] as Project[]
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [normsRes, ratesRes, projectsRes] = await Promise.all([
          fetch('/api/norms'),
          fetch('/api/rates'),
          fetch('/api/projects')
        ]);
        
        if (!normsRes.ok || !ratesRes.ok || !projectsRes.ok) {
          const errorText = await (normsRes.ok ? (ratesRes.ok ? projectsRes.text() : ratesRes.text()) : normsRes.text());
          throw new Error(`Server responded with ${normsRes.status}/${ratesRes.status}/${projectsRes.status}: ${errorText.substring(0, 100)}`);
        }

        const norms = await normsRes.json();
        const rates = await ratesRes.json();
        const projects = await projectsRes.json();
        
        setStats({
          norms: norms.length,
          rates: rates.length,
          projects: projects.length,
          recentProjects: projects.slice(0, 3)
        });
      } catch (e) {
        console.error("Failed to fetch dashboard stats", e);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tighter italic">Overview</h1>
        <p className="text-black/50">Welcome back. Here's what's happening with your norms and projects.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={<BookOpen className="text-blue-500" />} 
          label="Total Norms" 
          value={stats.norms} 
          onClick={() => onNavigate('norms')}
        />
        <StatCard 
          icon={<DollarSign className="text-emerald-500" />} 
          label="Resource Rates" 
          value={stats.rates} 
          onClick={() => onNavigate('rates')}
        />
        <StatCard 
          icon={<FolderKanban className="text-orange-500" />} 
          label="Active Projects" 
          value={stats.projects} 
          onClick={() => onNavigate('projects')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold tracking-tight">Recent Projects</h3>
            <button 
              onClick={() => onNavigate('projects')}
              className="text-xs font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
            >
              View All
            </button>
          </div>
          <div className="space-y-4">
            {stats.recentProjects.length > 0 ? stats.recentProjects.map(project => (
              <div key={project.id} className="flex items-center justify-between p-4 rounded-2xl bg-[#F5F5F0] hover:bg-[#EBEBE5] transition-colors cursor-pointer group">
                <div>
                  <p className="font-bold">{project.name}</p>
                  <p className="text-xs text-black/40">{new Date(project.created_at).toLocaleDateString()}</p>
                </div>
                <TrendingUp size={18} className="text-black/20 group-hover:text-black/40 transition-colors" />
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-12 text-black/30">
                <AlertCircle size={48} strokeWidth={1} className="mb-4" />
                <p className="text-sm font-medium">No projects found</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#141414] text-white rounded-3xl p-8 shadow-xl">
          <h3 className="text-xl font-bold tracking-tight mb-6">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <QuickAction 
              label="Add New Norm" 
              onClick={() => onNavigate('norms')}
              className="bg-white/10 hover:bg-white/20"
            />
            <QuickAction 
              label="Update Rates" 
              onClick={() => onNavigate('rates')}
              className="bg-white/10 hover:bg-white/20"
            />
            <QuickAction 
              label="New Project" 
              onClick={() => onNavigate('projects')}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            />
            <QuickAction 
              label="Rate Analysis" 
              onClick={() => onNavigate('rate-analysis')}
              className="bg-white/10 hover:bg-white/20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, onClick }: { icon: React.ReactNode, label: string, value: number, onClick: () => void }) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-[#F5F5F0] rounded-2xl">
          {icon}
        </div>
      </div>
      <p className="text-sm font-medium text-black/40 uppercase tracking-widest">{label}</p>
      <p className="text-4xl font-bold tracking-tighter mt-1">{value}</p>
    </motion.div>
  );
}

function QuickAction({ label, onClick, className }: { label: string, onClick: () => void, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`p-4 rounded-2xl text-sm font-bold transition-all text-center ${className}`}
    >
      {label}
    </button>
  );
}
