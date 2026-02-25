import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import AdminDashboard from '@/pages/AdminDashboard'
import DigitalComanda from '@/pages/DigitalComanda'
import CreateOrder from '@/pages/CreateOrder'
import DeliveryModule from '@/pages/DeliveryModule'
import Login from '@/pages/Auth/Login'
import Settings from '@/pages/Settings'
import { ProtectedRoute } from '@/components/Auth/ProtectedRoute'

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />

        {/* Protected Routes wrapped in Layout */}
        <Route path="/" element={<Layout />}>
          {/* Admin Dashboard */}
          <Route
            index
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Staff: Digital Comanda & Create Orders */}
          <Route
            path="comanda"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <DigitalComanda />
              </ProtectedRoute>
            }
          />
          <Route
            path="comanda/crear"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <CreateOrder />
              </ProtectedRoute>
            }
          />

          {/* Delivery Module */}
          <Route
            path="delivery"
            element={
              <ProtectedRoute allowedRoles={['admin', 'delivery']}>
                <DeliveryModule />
              </ProtectedRoute>
            }
          />

          {/* Settings — admin only */}
          <Route
            path="settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
