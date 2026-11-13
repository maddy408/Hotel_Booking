import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PwaInstallBanner from './components/PwaInstallBanner.jsx';
import Login from './pages/Login.jsx';
import Rooms from './pages/Rooms.jsx';
import Bookings from './pages/Bookings.jsx';
import TodayCheckouts from './pages/TodayCheckouts.jsx';
import Guests from './pages/Guests.jsx';
import Bills from './pages/Bills.jsx';
import Reports from './pages/Reports.jsx';
import RoomMaster from './pages/RoomMaster.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import InvoicePrint from './pages/InvoicePrint.jsx';

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/print/invoice/:stayId"
        element={
          <ProtectedRoute>
            <InvoicePrint />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Rooms />} />
        <Route path="bookings" element={<Bookings />} />
        <Route
          path="today-checkouts"
          element={
            <ProtectedRoute roles={['admin', 'manager', 'receptionist']}>
              <TodayCheckouts />
            </ProtectedRoute>
          }
        />
        <Route
          path="daily-ops"
          element={
            <ProtectedRoute roles={['admin', 'manager', 'receptionist']}>
              <TodayCheckouts />
            </ProtectedRoute>
          }
        />
        <Route path="guests" element={<Guests />} />
        <Route path="bills" element={<Bills />} />
        <Route
          path="reports"
          element={
            <ProtectedRoute roles={['admin', 'manager']}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="room-master"
          element={
            <ProtectedRoute roles={['admin', 'manager']}>
              <RoomMaster />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute roles={['admin']}>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
    <PwaInstallBanner />
    </>
  );
}
