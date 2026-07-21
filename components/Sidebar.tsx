import SidebarLink from './SidebarLink'
import ThemeToggle from './ThemeToggle'

const NAV = [
  { section: 'Main', items: [
    { label: 'Contacts',      href: '/contacts',      icon: '👥' },
    { label: 'Lead Pipeline', href: '/pipeline',      icon: '📋' },
    { label: 'Opportunities', href: '/opportunities', icon: '💰' },
    { label: 'Calendar',      href: '/calendar',      icon: '📅' },
    { label: 'Meetings',      href: '/meetings',      icon: '🗓️' },
  ]},
  { section: 'Activity', items: [
    { label: 'Activity', href: '/activity', icon: '🗒️' },
    { label: 'Time Tracking', href: '/time-tracking', icon: '⏱️' },
  ]},
  { section: 'Manage', items: [
    { label: 'Analytics',  href: '/analytics',  icon: '📊' },
    { label: 'Workflows',  href: '/workflows',  icon: '⚡' },
    { label: 'Settings',   href: '/settings',   icon: '⚙️' },
  ]},
]

export default function Sidebar({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Clarity.</div>
      {NAV.map(({ section, items }) => (
        <div key={section} className="sidebar-section">
          <div className="sidebar-section-title">{section}</div>
          {items.map((item) => (
            <SidebarLink key={item.href} {...item} />
          ))}
        </div>
      ))}
      <div className="sidebar-bottom">
        <ThemeToggle current={theme} />
      </div>
    </aside>
  )
}
