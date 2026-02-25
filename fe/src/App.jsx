import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout.jsx'
import Index from './pages/Index.jsx'
import Memory from './pages/Memory.jsx'
import Agent from './pages/Agent.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Index />,
      },
      {
        path: 'memory',
        element: <Memory />,
      },
      {
        path: 'agent',
        element: <Agent />,
      },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
