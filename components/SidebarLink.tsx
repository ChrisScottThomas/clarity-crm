'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SidebarLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/' && pathname.startsWith(href))
  return (
    <Link href={href} className={`sidebar-item${active ? ' active' : ''}`}>
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      {label}
    </Link>
  )
}
