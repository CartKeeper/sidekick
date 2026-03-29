import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Terminal, Code2, Globe, Rocket, FolderOpen } from 'lucide-react';
import { api, type Project, type Environment } from '../api/client';

interface StartCommand {
  name: string;
  command: string;
  path?: string;
}

interface LaunchTabProps {
  project: Project & { environments: Environment[] };
  onUpdate: () => void;
}

// Toggle switch component
function Toggle({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderBottom: '1px solid #2a2a3a',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: '#6b6b80' }}>{icon}</span>
        <span style={{ fontSize: '14px', color: '#e4e4ed' }}>{label}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: '40px',
          height: '24px',
          borderRadius: '9999px',
          backgroundColor: checked ? '#6366f1' : '#2a2a3a',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background-color 150ms ease',
          flexShrink: 0,
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: checked ? '19px' : '3px',
            width: '18px',
            height: '18px',
            borderRadius: '9999px',
            backgroundColor: '#ffffff',
            transition: 'left 150ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
}

// Section label style
const sectionLabel: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#a1a1b5',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '12px',
};

export function LaunchTab({ project, onUpdate }: LaunchTabProps) {
  const [commands, setCommands] = useState<StartCommand[]>(
    project.start_commands ?? []
  );
  const [devUrl, setDevUrl] = useState(project.dev_url ?? '');
  const [defaultEnv, setDefaultEnv] = useState(project.default_environment ?? '');
  const [enableTerminal, setEnableTerminal] = useState(project.enable_terminal ?? true);
  const [enableVscode, setEnableVscode] = useState(project.enable_vscode ?? false);
  const [enableBrowser, setEnableBrowser] = useState(project.enable_browser ?? true);
  const [saving, setSaving] = useState(false);
  const [launchTooltip, setLaunchTooltip] = useState(false);

  // Add command state
  const [addingCmd, setAddingCmd] = useState(false);
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdCommand, setNewCmdCommand] = useState('');
  const [newCmdPath, setNewCmdPath] = useState('');

  // Edit command state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editPath, setEditPath] = useState('');

  const save = async (fields: Partial<Project>) => {
    setSaving(true);
    try {
      await api.projects.update(project.id, fields);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleAddCommand = async () => {
    if (!newCmdName.trim() || !newCmdCommand.trim()) return;
    const updated = [
      ...commands,
      { name: newCmdName.trim(), command: newCmdCommand.trim(), path: newCmdPath.trim() || undefined },
    ];
    setCommands(updated);
    setAddingCmd(false);
    setNewCmdName('');
    setNewCmdCommand('');
    setNewCmdPath('');
    await save({ start_commands: updated });
  };

  const handleDeleteCommand = async (index: number) => {
    const updated = commands.filter((_, i) => i !== index);
    setCommands(updated);
    await save({ start_commands: updated });
  };

  const handleStartEdit = (index: number) => {
    const cmd = commands[index];
    setEditingIndex(index);
    setEditName(cmd.name);
    setEditCommand(cmd.command);
    setEditPath(cmd.path ?? '');
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null) return;
    const updated = commands.map((cmd, i) =>
      i === editingIndex
        ? { name: editName.trim(), command: editCommand.trim(), path: editPath.trim() || undefined }
        : cmd
    );
    setCommands(updated);
    setEditingIndex(null);
    await save({ start_commands: updated });
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const inputStyle: React.CSSProperties = {
    height: '40px',
    padding: '0 12px',
    fontSize: '14px',
    color: '#e4e4ed',
    backgroundColor: '#12121a',
    border: '1px solid #2a2a3a',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
  };

  const monoInputStyle: React.CSSProperties = {
    ...inputStyle,
    fontFamily: 'var(--font-mono, monospace)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Start Commands */}
      <section>
        <p style={sectionLabel}>Start Commands</p>
        <div
          style={{
            backgroundColor: '#1a1a25',
            border: '1px solid #2a2a3a',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {commands.length === 0 && !addingCmd ? (
            <div
              style={{
                padding: '32px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                color: '#6b6b80',
              }}
            >
              <Terminal size={32} color="#3a3a4a" />
              <p style={{ fontSize: '14px', color: '#6b6b80', margin: 0 }}>
                No start commands configured
              </p>
              <button
                type="button"
                onClick={() => setAddingCmd(true)}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#6366f1',
                  backgroundColor: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                  minWidth: '64px',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(99,102,241,0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(99,102,241,0.1)';
                }}
              >
                Add your first command
              </button>
            </div>
          ) : (
            <div>
              {commands.map((cmd, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 16px',
                    borderBottom: i < commands.length - 1 || addingCmd ? '1px solid #2a2a3a' : undefined,
                  }}
                >
                  {editingIndex === i ? (
                    // Edit mode
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Command name"
                          style={{ ...inputStyle, flex: '0 0 140px' }}
                        />
                        <input
                          type="text"
                          value={editCommand}
                          onChange={(e) => setEditCommand(e.target.value)}
                          placeholder="npm run dev"
                          style={{ ...monoInputStyle, flex: 1 }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <FolderOpen
                            size={13}
                            style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: '#6b6b80',
                              pointerEvents: 'none',
                            }}
                          />
                          <input
                            type="text"
                            value={editPath}
                            onChange={(e) => setEditPath(e.target.value)}
                            placeholder="Working dir (optional)"
                            style={{ ...monoInputStyle, paddingLeft: '30px' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(34,197,94,0.1)',
                            border: '1px solid rgba(34,197,94,0.3)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#22c55e',
                            flexShrink: 0,
                          }}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: '1px solid #2a2a3a',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#6b6b80',
                            flexShrink: 0,
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Display mode
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4ed', marginBottom: '2px' }}>
                          {cmd.name}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#a1a1b5',
                            fontFamily: 'var(--font-mono, monospace)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cmd.command}
                        </div>
                        {cmd.path && (
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#6b6b80',
                              fontFamily: 'var(--font-mono, monospace)',
                              marginTop: '2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {cmd.path}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(i)}
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: '1px solid #2a2a3a',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#6b6b80',
                            transition: 'color 150ms ease, border-color 150ms ease',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a4a';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a3a';
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCommand(i)}
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'transparent',
                            border: '1px solid #2a2a3a',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#6b6b80',
                            transition: 'color 150ms ease, border-color 150ms ease, background-color 150ms ease',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.4)';
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a3a';
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new command inline form */}
              {addingCmd && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={newCmdName}
                      onChange={(e) => setNewCmdName(e.target.value)}
                      placeholder="Command name"
                      autoFocus
                      style={{ ...inputStyle, flex: '0 0 140px' }}
                    />
                    <input
                      type="text"
                      value={newCmdCommand}
                      onChange={(e) => setNewCmdCommand(e.target.value)}
                      placeholder="npm run dev"
                      style={{ ...monoInputStyle, flex: 1 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <FolderOpen
                        size={13}
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#6b6b80',
                          pointerEvents: 'none',
                        }}
                      />
                      <input
                        type="text"
                        value={newCmdPath}
                        onChange={(e) => setNewCmdPath(e.target.value)}
                        placeholder="Working dir (optional)"
                        style={{ ...monoInputStyle, paddingLeft: '30px' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCommand}
                      style={{
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(34,197,94,0.1)',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: '#22c55e',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingCmd(false); setNewCmdName(''); setNewCmdCommand(''); setNewCmdPath(''); }}
                      style={{
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'transparent',
                        border: '1px solid #2a2a3a',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: '#6b6b80',
                        flexShrink: 0,
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Command button (shown when there are already commands) */}
        {commands.length > 0 && !addingCmd && (
          <button
            type="button"
            onClick={() => setAddingCmd(true)}
            style={{
              marginTop: '8px',
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#6b6b80',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a3a',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 150ms ease, border-color 150ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a4a';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a3a';
            }}
          >
            <Plus size={13} />
            Add Command
          </button>
        )}
      </section>

      {/* Dev URL */}
      <section>
        <p style={sectionLabel}>Dev URL</p>
        <input
          type="text"
          value={devUrl}
          onChange={(e) => setDevUrl(e.target.value)}
          onBlur={async () => {
            if (devUrl !== project.dev_url) {
              await save({ dev_url: devUrl });
            }
          }}
          placeholder="http://localhost:3000"
          style={inputStyle}
        />
      </section>

      {/* Default Environment */}
      <section>
        <p style={sectionLabel}>Default Environment</p>
        <select
          value={defaultEnv}
          onChange={async (e) => {
            setDefaultEnv(e.target.value);
            await save({ default_environment: e.target.value });
          }}
          style={{
            ...inputStyle,
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '36px',
            cursor: 'pointer',
          }}
        >
          <option value="">None</option>
          {project.environments?.map((env) => (
            <option key={env.id} value={env.slug}>
              {env.name}
            </option>
          ))}
        </select>
      </section>

      {/* Launch Actions */}
      <section>
        <p style={sectionLabel}>Launch Actions</p>
        <div
          style={{
            backgroundColor: '#1a1a25',
            border: '1px solid #2a2a3a',
            borderRadius: '12px',
            padding: '0 16px',
          }}
        >
          <Toggle
            checked={enableTerminal}
            onChange={async (val) => {
              setEnableTerminal(val);
              await save({ enable_terminal: val });
            }}
            label="Open Terminal"
            icon={<Terminal size={16} />}
          />
          <Toggle
            checked={enableVscode}
            onChange={async (val) => {
              setEnableVscode(val);
              await save({ enable_vscode: val });
            }}
            label="Open VS Code"
            icon={<Code2 size={16} />}
          />
          <div style={{ borderBottom: 'none' }}>
            <Toggle
              checked={enableBrowser}
              onChange={async (val) => {
                setEnableBrowser(val);
                await save({ enable_browser: val });
              }}
              label="Open Browser"
              icon={<Globe size={16} />}
            />
          </div>
        </div>
      </section>

      {/* Launch Button */}
      <section>
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <button
            type="button"
            onClick={() => setLaunchTooltip(true)}
            onMouseLeave={() => setTimeout(() => setLaunchTooltip(false), 150)}
            style={{
              width: '100%',
              height: '48px',
              backgroundColor: '#6366f1',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 150ms ease',
              opacity: saving ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5558e6';
            }}
          >
            <Rocket size={18} />
            Launch Project
          </button>

          {launchTooltip && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#2a2a3a',
                border: '1px solid #3a3a4a',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                color: '#a1a1b5',
                whiteSpace: 'nowrap',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              Launch functionality coming in Phase 3
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid #3a3a4a',
                }}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
