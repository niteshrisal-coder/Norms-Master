import React, { useState, useEffect } from 'react';
import { Plus, FolderKanban, Calendar, ArrowRight, Trash2, AlertTriangle } from 'lucide-react';
import { Project } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function Projects({ onSelectProject }: { onSelectProject: (id: number) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({ name: '', description: '', mode: 'CONTRACTOR' as 'CONTRACTOR' | 'USERS' });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      console.log('Fetching projects...');
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      console.log('Projects fetched:', data);
      setProjects(data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleCreate = async () => {
    if (!newProject.name) return;
    try {
      console.log('Creating new project:', newProject);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to create project' }));
        throw new Error(errorData.error || 'Failed to create project');
      }
      
      const data = await res.json();
      console.log('Project created:', data);
      
      setNewProject({ name: '', description: '', mode: 'CONTRACTOR' });
      setIsModalOpen(false);
      fetchProjects();
    } catch (error: any) {
      console.error('Error creating project:', error);
      alert(error.message || 'Failed to create project');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // Prevent triggering the project selection
    console.log('Delete clicked for project:', project);
    setProjectToDelete(project);
    setIsDeleteModalOpen(true);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      console.log(`Attempting to delete project: ${projectToDelete.id} - ${projectToDelete.name}`);
      
      const response = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      // Check content type
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);
      
      // Try to get the response text first for debugging
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      // If response is empty, handle that case
      if (!responseText) {
        if (response.ok) {
          // Empty response but success status - assume it worked
          console.log('Empty response with success status - assuming deletion worked');
          setProjects(prevProjects => prevProjects.filter(p => p.id !== projectToDelete.id));
          setIsDeleteModalOpen(false);
          setProjectToDelete(null);
          return;
        } else {
          throw new Error(`Server returned empty response with status ${response.status}`);
        }
      }
      
      // Try to parse as JSON if possible
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed JSON data:', data);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error(`Server returned invalid response. Status: ${response.status}, Response: ${responseText.substring(0, 100)}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || `Failed to delete project (Status: ${response.status})`);
      }
      
      // Success - update the local state
      setProjects(prevProjects => prevProjects.filter(p => p.id !== projectToDelete.id));
      
      // Close the modal and reset state
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
      
      console.log('Project deleted successfully:', data.message);
      
    } catch (error: any) {
      console.error('Error in delete confirmation:', error);
      setDeleteError(error.message || 'Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    console.log('Delete cancelled');
    setIsDeleteModalOpen(false);
    setProjectToDelete(null);
    setDeleteError(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tighter italic">My Projects</h1>
          <p className="text-black/50">Create and manage project-specific Bills of Quantities (BOQ).</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#141414] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-black/10"
        >
          <Plus size={20} />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <motion.div 
            whileHover={{ y: -4 }}
            key={project.id}
            className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 cursor-pointer group hover:shadow-xl transition-all relative"
            onClick={() => onSelectProject(project.id)}
          >
            {/* Delete button - positioned absolutely */}
            <button
              onClick={(e) => handleDeleteClick(e, project)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 z-10"
              aria-label="Delete project"
              title="Delete project"
            >
              <Trash2 size={16} />
            </button>

            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <FolderKanban size={24} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/20 flex items-center gap-1">
                <Calendar size={12} />
                {new Date(project.created_at).toLocaleDateString()}
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-2 group-hover:text-emerald-600 transition-colors pr-8">{project.name}</h3>
            <p className="text-sm text-black/40 line-clamp-2 mb-8 h-10">{project.description || 'No description provided.'}</p>
            
            <div className="flex items-center justify-between pt-6 border-t border-black/5">
              <span className="text-xs font-bold uppercase tracking-widest text-black/40">Open BOQ</span>
              <div className="w-8 h-8 rounded-full bg-[#F5F5F0] flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <ArrowRight size={16} />
              </div>
            </div>
          </motion.div>
        ))}

        {projects.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-black/20 border-2 border-dashed border-black/5 rounded-3xl">
            <FolderKanban size={64} strokeWidth={1} className="mb-4" />
            <p className="font-medium">No projects yet. Create your first one to start building BOQs.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && projectToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-black/5 bg-red-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-red-900">Delete Project</h2>
                    <p className="text-sm text-red-700/70">This action cannot be undone</p>
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-4">
                <p className="text-black/70">
                  Are you sure you want to delete <span className="font-bold text-black">"{projectToDelete.name}"</span>?
                </p>
                <p className="text-sm text-black/50">
                  This will permanently delete the project and all associated BOQ items, rate overrides, and transport settings.
                </p>
                
                {deleteError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-600 font-medium">{deleteError}</p>
                    <p className="text-xs text-red-500 mt-1">Please try again or check the console for more details.</p>
                  </div>
                )}
                
                {/* Debug info - remove in production */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs">
                    <p className="font-mono">Project ID: {projectToDelete.id}</p>
                    <p className="font-mono">Project Name: {projectToDelete.name}</p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-[#F5F5F0]/50 border-t border-black/5 flex justify-end gap-4">
                <button 
                  onClick={handleDeleteCancel}
                  disabled={isDeleting}
                  className="px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="bg-red-600 text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Project'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Project Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-black/5 bg-[#F5F5F0]/50">
                <h2 className="text-2xl font-bold tracking-tight">Create Project</h2>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Project Name</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm font-bold"
                    placeholder="e.g. Kathmandu Road Expansion"
                    value={newProject.name}
                    onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Description</label>
                  <textarea 
                    className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black/5 text-sm min-h-[100px]"
                    placeholder="Project details, location, etc."
                    value={newProject.description}
                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Project Mode</label>
                  <div className="flex bg-[#F5F5F0] p-1 rounded-xl border border-black/5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setNewProject({ ...newProject, mode: 'CONTRACTOR' })}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${newProject.mode === 'CONTRACTOR' ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
                    >
                      Contractor
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewProject({ ...newProject, mode: 'USERS' })}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${newProject.mode === 'USERS' ? 'bg-[#141414] text-white shadow-md' : 'text-black/40 hover:text-black/60'}`}
                    >
                      Users Committee
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-[#F5F5F0]/50 border-t border-black/5 flex justify-end gap-4">
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreate}
                  disabled={!newProject.name}
                  className="bg-[#141414] text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Project
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}