import { Outlet } from 'react-router'

function Layout() {
  return (
    <div className="min-h-screen bg-zinc-900">
      <main className="w-full h-full p-3">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
