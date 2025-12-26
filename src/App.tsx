import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import VendorPage from './pages/VendorPage';
import SearchResults from './pages/SearchResults';
import AboutUs from './pages/AboutUs';
import Chatbot from './components/Chatbot';
import BecomeVendor from './pages/BecomeVendor';
import Blog from './pages/Blog';
import Profile from './pages/Profile';
import VendorDashboard from './pages/VendorDashboard';
import Auth from './pages/Auth';

const ProtectedRoute = ({ children, vendorOnly = false }: { children: React.ReactNode, vendorOnly?: boolean }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" />;
  }

  if (vendorOnly && user.user_metadata?.user_type !== 'vendor') {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-white flex flex-col">
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/vendor/dashboard/*"
              element={
                <ProtectedRoute vendorOnly={true}>
                  <VendorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <>
                    <Navbar />
                    <main className="flex-grow">
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/category/:categoryName" element={<CategoryPage />} />
                        <Route path="/vendor/:vendorId" element={<VendorPage />} />
                        <Route path="/search" element={<SearchResults />} />
                        <Route path="/about" element={<AboutUs />} />
                        <Route path="/become-vendor" element={<BecomeVendor />} />
                        <Route path="/blog" element={<Blog />} />
                        <Route path="/profile" element={<Profile />} />
                      </Routes>
                    </main>
                    <Chatbot />
                    <Footer />
                  </>
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;