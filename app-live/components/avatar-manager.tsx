'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  IconPlus as Plus,
  IconSparkles as Sparkles,
  IconTrash as Trash,
  IconPlayerPlay as Play,
  IconCheck as Check,
  IconCopy as Copy,
  IconReload as Refresh,
  IconUser as User,
  IconSearch as Search,
  IconWand as Wand,
  IconDeviceTv as Video,
  IconX as X,
  IconAdjustmentsHorizontal as Sliders,
  IconUpload as Upload,
  IconLink as LinkIcon
} from '@tabler/icons-react'

import { AvatarProfile, PRESET_AVATARS } from '@/lib/engine/avatars-data'
import { Button } from '@/components/ui/button'

const SAMPLE_PORTRAITS = [
  {
    name: 'Alex (Tech Host)',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Elena (Documentary)',
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Marcus (Finance)',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Sophia (Lifestyle)',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'David (News Anchor)',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Chloe (Creator)',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80'
  }
]

export function AvatarManager() {
  const router = useRouter()
  const [avatars, setAvatars] = useState<AvatarProfile[]>(PRESET_AVATARS)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'presets' | 'custom'>('all')

  // Modal / Creator State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAvatar, setEditingAvatar] = useState<AvatarProfile | null>(null)
  
  // Form Fields
  const [name, setName] = useState('')
  const [role, setRole] = useState('Tech Presenter')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState(SAMPLE_PORTRAITS[0].url)
  const [bboxShift, setBboxShift] = useState(0)
  const [voiceName, setVoiceName] = useState('en-US-Neural2-F')
  const [saving, setSaving] = useState(false)

  // Live Test State
  const [testingId, setTestingId] = useState<string | null>(null)
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const [previewAvatarName, setPreviewAvatarName] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchAvatars()
  }, [])

  const fetchAvatars = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/avatar')
      if (res.ok) {
        const data = await res.json()
        if (data.avatars) {
          setAvatars(data.avatars)
        }
      }
    } catch (err) {
      console.warn('Failed to load avatars API, using presets:', err)
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingAvatar(null)
    setName('')
    setRole('Tech Host')
    setDescription('Custom AI presenter for talking A-roll videos.')
    setImageUrl(SAMPLE_PORTRAITS[0].url)
    setBboxShift(0)
    setVoiceName('en-US-Neural2-F')
    setIsModalOpen(true)
  }

  const openEditModal = (avatar: AvatarProfile) => {
    setEditingAvatar(avatar)
    setName(avatar.name)
    setRole(avatar.role)
    setDescription(avatar.description)
    setImageUrl(avatar.imageUrl)
    setBboxShift(avatar.bboxShift)
    setVoiceName(avatar.voiceName || 'en-US-Neural2-F')
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !imageUrl.trim()) return

    setSaving(true)
    try {
      const res = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingAvatar?.id,
          name,
          role,
          description,
          imageUrl,
          bboxShift,
          voiceName
        })
      })

      if (res.ok) {
        await fetchAvatars()
        setIsModalOpen(false)
      }
    } catch (err) {
      console.error('Failed to save avatar:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this custom avatar?')) return
    try {
      const res = await fetch(`/api/avatar?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setAvatars(prev => prev.filter(a => a.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete avatar:', err)
    }
  }

  const handleTestLipSync = async (avatar: AvatarProfile) => {
    setTestingId(avatar.id)
    try {
      const res = await fetch('/api/avatar/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          avatarImageUrl: avatar.imageUrl,
          bboxShift: avatar.bboxShift
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.videoUrl) {
          setPreviewVideoUrl(data.videoUrl)
          setPreviewAvatarName(avatar.name)
        }
      }
    } catch (err) {
      console.error('Test lip-sync failed:', err)
    } finally {
      setTestingId(null)
    }
  }

  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleUseInChat = (avatar: AvatarProfile) => {
    const prompt = `Create a video featuring presenter avatar "${avatar.name}" (${avatar.role}). Use talking avatar A-roll with image URL ${avatar.imageUrl}.`
    router.push(`/chat?q=${encodeURIComponent(prompt)}`)
  }

  const filteredAvatars = avatars.filter(avatar => {
    const matchesSearch =
      avatar.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      avatar.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      avatar.description.toLowerCase().includes(searchQuery.toLowerCase())

    if (activeTab === 'presets') return matchesSearch && avatar.isPreset
    if (activeTab === 'custom') return matchesSearch && !avatar.isPreset
    return matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* Header Bar & Control Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-xl">
        {/* Search & Tabs */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search avatars..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background/60 pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="inline-flex rounded-xl border border-border/60 bg-background/50 p-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({avatars.length})
            </button>
            <button
              onClick={() => setActiveTab('presets')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'presets'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Presets ({avatars.filter(a => a.isPreset).length})
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'custom'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Custom ({avatars.filter(a => !a.isPreset).length})
            </button>
          </div>
        </div>

        {/* Create Button */}
        <Button
          onClick={openCreateModal}
          className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20 gap-2 font-bold"
        >
          <Plus className="size-4" />
          Create New Avatar
        </Button>
      </div>

      {/* Video Test Preview Banner */}
      {previewVideoUrl && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/10 via-card to-background p-4 backdrop-blur-xl animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Sparkles className="size-4 animate-spin text-primary" />
              <span>Live MuseTalk Lip-Sync Preview: {previewAvatarName}</span>
            </div>
            <button
              onClick={() => setPreviewVideoUrl(null)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="relative aspect-video max-w-md mx-auto rounded-xl overflow-hidden border border-border shadow-2xl bg-black">
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Avatars Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-80 rounded-2xl border border-border/40 bg-card/20 animate-pulse"
            />
          ))}
        </div>
      ) : filteredAvatars.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border/60 bg-card/20 space-y-3">
          <User className="size-12 mx-auto text-muted-foreground/50" />
          <h3 className="text-base font-bold text-foreground">No Avatars Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No avatars match your search criteria. Create your first custom AI presenter avatar to start generating talking A-roll videos!
          </p>
          <Button
            onClick={openCreateModal}
            variant="outline"
            className="mt-2 rounded-xl gap-2"
          >
            <Plus className="size-4" />
            Create Avatar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredAvatars.map(avatar => (
            <div
              key={avatar.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
            >
              {/* Image Preview Container */}
              <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
                <img
                  src={avatar.imageUrl}
                  alt={avatar.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

                {/* Badge Top Left */}
                <div className="absolute top-3 left-3 flex flex-col gap-1">
                  {avatar.isPreset ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/20 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold text-primary">
                      <Sparkles className="size-3" /> Preset
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/20 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                      <User className="size-3" /> Custom
                    </span>
                  )}
                </div>

                {/* Modal GPU Badge Top Right */}
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    MuseTalk
                  </span>
                </div>

                {/* Lip Sync Test Play Overlay Button */}
                <button
                  onClick={() => handleTestLipSync(avatar)}
                  disabled={testingId === avatar.id}
                  className="absolute inset-0 m-auto size-12 rounded-full bg-primary/90 text-primary-foreground shadow-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100 hover:bg-primary"
                  title="Test Lip Sync Preview"
                >
                  {testingId === avatar.id ? (
                    <Refresh className="size-5 animate-spin" />
                  ) : (
                    <Play className="size-5 ml-0.5 fill-current" />
                  )}
                </button>
              </div>

              {/* Card Body */}
              <div className="flex flex-1 flex-col p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                      {avatar.name}
                    </h3>
                  </div>
                  <p className="text-xs font-semibold text-primary/80 mt-0.5">
                    {avatar.role}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {avatar.description}
                </p>

                {/* Info Footer */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Shift: {avatar.bboxShift > 0 ? `+${avatar.bboxShift}` : avatar.bboxShift}</span>
                  <button
                    onClick={() => handleCopyUrl(avatar.id, avatar.imageUrl)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {copiedId === avatar.id ? (
                      <>
                        <Check className="size-3 text-green-400" />
                        <span className="text-green-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    onClick={() => handleUseInChat(avatar)}
                    size="sm"
                    className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-semibold gap-1"
                  >
                    <Video className="size-3.5" /> Use in Video
                  </Button>

                  {!avatar.isPreset ? (
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => openEditModal(avatar)}
                        variant="outline"
                        size="sm"
                        className="flex-1 rounded-xl text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleDelete(avatar.id)}
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10 rounded-xl"
                      >
                        <Trash className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleTestLipSync(avatar)}
                      disabled={testingId === avatar.id}
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-xs gap-1"
                    >
                      {testingId === avatar.id ? (
                        <Refresh className="size-3 animate-spin" />
                      ) : (
                        <Play className="size-3" />
                      )}
                      Test
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal / Drawer for Creating / Editing Avatars */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Wand className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {editingAvatar ? 'Edit Presenter Avatar' : 'Create New Presenter Avatar'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Configure your presenter portrait and lip-sync settings for MuseTalk A-roll synthesis.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-5">
              {/* Name & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Avatar Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Rivera"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background/80 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Presenter Category / Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Tech Host, Finance Analyst"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background/80 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Description / Tone</label>
                <textarea
                  rows={2}
                  placeholder="Describe the presenter style and topic fit..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/80 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* Portrait Picker / Image URL */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Presenter Face Portrait *</span>
                  <span className="text-[11px] text-muted-foreground font-normal">Choose preset or enter custom image URL</span>
                </label>

                {/* Sample Portraits Grid */}
                <div className="grid grid-cols-6 gap-2">
                  {SAMPLE_PORTRAITS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setImageUrl(p.url)}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        imageUrl === p.url
                          ? 'border-primary ring-2 ring-primary/40 scale-105'
                          : 'border-border/60 hover:border-border'
                      }`}
                    >
                      <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                      {imageUrl === p.url && (
                        <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                          <Check className="size-4 text-white stroke-[3]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Custom Image URL Input */}
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/portrait.jpg"
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background/80 pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Bounding Box Shift Slider */}
              <div className="space-y-2 rounded-2xl border border-border/50 bg-background/40 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <Sliders className="size-4 text-primary" /> Lip Alignment (bbox_shift)
                  </span>
                  <span className="font-mono text-primary font-bold">
                    {bboxShift > 0 ? `+${bboxShift}` : bboxShift}
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={bboxShift}
                  onChange={e => setBboxShift(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Adjust lower-face bounding box crop for MuseTalk neural lip synthesis. Use 0 for standard portraits, +2 to +5 if lips appear slightly low.
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/50">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl px-6 gap-2"
                >
                  {saving ? <Refresh className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {editingAvatar ? 'Save Changes' : 'Create Avatar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
