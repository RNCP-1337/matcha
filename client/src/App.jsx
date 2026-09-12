import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import About from './pages/About.jsx';
import Activity from './pages/Activity.jsx';
import Browse from './pages/Browse.jsx';
import Chat from './pages/Chat.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import MapView from './pages/MapView.jsx';
import Meetups from './pages/Meetups.jsx';
import Notifications from './pages/Notifications.jsx';
import OAuthResult from './pages/OAuthResult.jsx';
import Profile from './pages/Profile.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';
import Verify from './pages/Verify.jsx';
import { useApp } from './state/AppState.jsx';

function Private({ children }) {
  const { user, ready } = useApp();
  const location = useLocation();

  if (!ready) return <p className="loading">Loading...</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function Public({ children }) {
  const { user, ready } = useApp();

  if (!ready) return <p className="loading">Loading...</p>;
  if (user) return <Navigate to="/browse" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="narrow center">
      <h1>Page not found</h1>
      <p className="muted">That address does not lead anywhere on Matcha.</p>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <Public>
              <Landing />
            </Public>
          }
        />
        <Route
          path="/login"
          element={
            <Public>
              <Login />
            </Public>
          }
        />
        <Route
          path="/register"
          element={
            <Public>
              <Register />
            </Public>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <Public>
              <ForgotPassword />
            </Public>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/oauth" element={<OAuthResult />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/about" element={<About />} />

        <Route
          path="/browse"
          element={
            <Private>
              <Browse />
            </Private>
          }
        />
        <Route
          path="/search"
          element={
            <Private>
              <Search />
            </Private>
          }
        />
        <Route
          path="/map"
          element={
            <Private>
              <MapView />
            </Private>
          }
        />
        <Route
          path="/meetups"
          element={
            <Private>
              <Meetups />
            </Private>
          }
        />
        <Route
          path="/activity"
          element={
            <Private>
              <Activity />
            </Private>
          }
        />
        <Route
          path="/notifications"
          element={
            <Private>
              <Notifications />
            </Private>
          }
        />
        <Route
          path="/settings"
          element={
            <Private>
              <Settings />
            </Private>
          }
        />
        <Route
          path="/profile/:username"
          element={
            <Private>
              <Profile />
            </Private>
          }
        />
        <Route
          path="/chat"
          element={
            <Private>
              <Chat />
            </Private>
          }
        />
        <Route
          path="/chat/:partnerId"
          element={
            <Private>
              <Chat />
            </Private>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
