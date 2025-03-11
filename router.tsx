import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './src/App';
import Dashboard from './src/components/Dashboard';
import StockDetails from './src/pages/StockDetails';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/',
        element: <Dashboard />
      },
      {
        path: '/stocks/:symbol',
        element: <StockDetails />
      }
    ]
  }
]);

export default function App() {
  return <RouterProvider router={router} />;
}