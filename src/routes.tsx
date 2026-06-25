import Login from './pages/Login';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Pricing from './pages/Pricing';
import PaymentSuccess from './pages/PaymentSuccess';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ConfirmEmail from './pages/ConfirmEmail';
import Admin from './pages/Admin';
import type { ReactNode } from 'react';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. Has no effect when RouteGuard is not in use. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'Login', path: '/', element: <Login />, public: true },
  { name: 'Forgot Password', path: '/forgot-password', element: <ForgotPassword />, public: true },
  { name: 'Reset Password', path: '/reset-password', element: <ResetPassword />, public: true },
  { name: 'Confirm Email', path: '/confirm-email', element: <ConfirmEmail />, public: true },
  { name: 'Chat', path: '/chat', element: <Chat />, public: false },
  { name: 'Profile', path: '/profile', element: <Profile />, public: false },
  { name: 'Pricing', path: '/pricing', element: <Pricing />, public: false },
  { name: 'Payment Success', path: '/payment-success', element: <PaymentSuccess />, public: false },
  { name: 'Admin', path: '/admin', element: <Admin />, public: false },
];
