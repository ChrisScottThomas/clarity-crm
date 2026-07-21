import '../styles/tokens.css'
import '../styles/layout.css'
import Sidebar from '../components/Sidebar'
import GlobalSearch from '../components/GlobalSearch'
import { getTheme } from '../components/ThemeProvider'

export const metadata = { title: 'Clarity CRM' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme()
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <div className="app-shell">
          <Sidebar theme={theme} />
          <div className="main-content">
            <header className="main-header">
              <GlobalSearch />
            </header>
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}
