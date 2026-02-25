import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout.jsx'
import Memory from './pages/Memory.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Welcome to Backboard</h1>
            <p className="text-zinc-400">
              Use the Memory Console to manage your assistants, threads, documents, and models.
            </p>
            <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-300">
                Enter your Backboard API key in the top right to get started.
              </p>
            </div>
          </div>
        ),
      },
      {
        path: 'memory',
        element: <Memory />,
      },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
