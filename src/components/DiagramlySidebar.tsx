import { authClient } from '../lib/auth'
import { navigate } from '../lib/navigate'
import { avatarUrl } from '../../shared/avatar'
import { colorFor } from '../../shared/types'
import { Avatar } from './ui/avatar'
import { DashNavItem, DashSidebar, DashSidebarBrand } from './ui/dash'
import { BookOpenIcon, CirclePlusIcon, GearIcon, GridIcon } from './ui/icons'

export function DiagramlySidebar({
  user,
  onConnectAgent,
  onImportLibrary,
  onSettings,
}: {
  user?: { id?: string; name?: string; image?: string | null }
  onConnectAgent: () => void
  onImportLibrary: () => void
  onSettings?: () => void
}) {
  const { data: session } = authClient.useSession()
  const localUser = user ?? session?.user
  const name = localUser?.name || 'Local account'
  const identity = localUser?.id || name
  const image = avatarUrl(localUser?.image)

  return (
    <DashSidebar variant="rail" aria-label="Diagramly sidebar">
      <DashSidebarBrand onHome={() => navigate('/')}>
        <span className="ml-1 font-display text-body font-semibold text-ink">Diagramly</span>
      </DashSidebarBrand>
      <nav aria-label="Diagramly navigation" className="flex flex-col gap-0.5">
        <DashNavItem density="rail" icon={<GridIcon size="rail" />} active onClick={() => navigate('/')}>
          All documents
        </DashNavItem>
        <DashNavItem density="rail" icon={<CirclePlusIcon size="rail" />} onClick={onConnectAgent}>
          Connect an agent
        </DashNavItem>
        <DashNavItem density="rail" icon={<BookOpenIcon size="rail" />} onClick={onImportLibrary}>
          Import library
        </DashNavItem>
      </nav>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <DashNavItem
          density="rail"
          icon={<GearIcon size="rail" />}
          onClick={onSettings ?? (() => navigate('/settings'))}
        >
          Settings
        </DashNavItem>
        <div className="flex min-w-0 items-center gap-[11px] rounded-row px-[11px] py-2 text-body text-ink-soft">
          <Avatar name={name} image={image} color={colorFor(identity)} size={28} />
          <span className="min-w-0 truncate">{name}</span>
        </div>
      </div>
    </DashSidebar>
  )
}
