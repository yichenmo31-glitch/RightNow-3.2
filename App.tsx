import React, { useState, useEffect } from 'react';
import { View } from './types';
import { authApi, TOKEN_KEY } from './api';
import type { AuthUser } from './api';
import Login from './views/Login';
import Register from './views/Register';
import Splash from './views/Splash';
import Onboarding from './views/Onboarding';
import Dashboard from './views/Dashboard';
import EvolutionEngine from './views/EvolutionEngine';
import DataDashboard from './views/DataDashboard';
import DietLog from './views/DietLog';
import Community from './views/Community';
import AIChat from './views/AIChat';
import EvolutionRecord from './views/EvolutionRecord';
import EvolutionProgress from './views/EvolutionProgress';
import CheckInType from './views/CheckInType';
import CheckInBody from './views/CheckInBody';
import CheckInSuccess from './views/CheckInSuccess';
import CheckInShare from './views/CheckInShare';
import EvolutionGallery from './views/EvolutionGallery';
import ActionCenter from './views/ActionCenter';
import WeightRecord from './views/WeightRecord';
import BottomNav from './components/BottomNav';
import FloatingAdvisor from './components/FloatingAdvisor';

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.Splash);

  // Lifted state to persist user data across views
  const [userImage, setUserImage] = useState<string | null>(null);
  const [userFaceImage, setUserFaceImage] = useState<string | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyStyle, setBodyStyle] = useState<string>('');
  const [hasUnreadAI, setHasUnreadAI] = useState<boolean>(false);

  const [customPhotos, setCustomPhotos] = useState<string[]>([]);

  // Check for existing token on mount (stay on Splash either way)
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      authApi.me()
        .then((user) => setAuthUser(user))
        .catch(() => localStorage.removeItem(TOKEN_KEY))
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  const handleAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    setCurrentView(View.Onboarding);
  };

  const handleLogout = () => {
    authApi.logout();
    setAuthUser(null);
    setCurrentView(View.Login);
  };

  const handleSaveActionCenter = (photo: string | null) => {
    if (photo) {
      setCustomPhotos(prev => [photo, ...prev]);
    }
  };

  const handleSplashComplete = () => {
    // Already logged in → skip login, go to Onboarding
    if (authUser) {
      setCurrentView(View.Onboarding);
    } else {
      setCurrentView(View.Login);
    }
  };

  const handleOnboardingComplete = (image: string | null, isComplete: boolean = true, userGender: 'male' | 'female' = 'male', userBodyStyle: string = '', customIdealImage: string | null = null) => {
    if (image) {
      setUserImage(image);
    }
    if (customIdealImage) {
      setUserFaceImage(customIdealImage); // Repurposing userFaceImage for customIdealImage
    }

    setIsProfileComplete(isComplete);
    setGender(userGender);
    setBodyStyle(userBodyStyle);

    if (isComplete) {
      // Normal flow: Co-creation
      setCurrentView(View.Evolution);
    } else {
      // Skipped flow: Go to Dashboard (Incomplete State)
      setCurrentView(View.Dashboard);
    }
  };

  const renderView = () => {
    // Splash is always accessible (shown first before auth)
    if (currentView === View.Splash) {
      return <Splash onComplete={handleSplashComplete} />;
    }

    // Auth screens (no guard needed)
    if (currentView === View.Login) {
      return <Login onLoginSuccess={handleAuthSuccess} onGoRegister={() => setCurrentView(View.Register)} />;
    }
    if (currentView === View.Register) {
      return <Register onRegisterSuccess={handleAuthSuccess} onGoLogin={() => setCurrentView(View.Login)} />;
    }

    // Route guard: redirect to login if not authenticated
    if (!authUser) {
      return <Login onLoginSuccess={handleAuthSuccess} onGoRegister={() => setCurrentView(View.Register)} />;
    }

    switch (currentView) {
      case View.Onboarding:
        return <Onboarding onComplete={handleOnboardingComplete} />;
      case View.Dashboard:
        return <Dashboard onNavigate={setCurrentView} isProfileComplete={isProfileComplete} authUser={authUser} />;
      case View.Evolution:
        return <EvolutionEngine userImage={userImage} userFaceImage={userFaceImage} bodyStyle={bodyStyle} onComplete={() => {
          setHasUnreadAI(true);
          setCurrentView(View.Dashboard);
        }} />;
      case View.Stats:
        return <DataDashboard onNavigate={setCurrentView} />;
      case View.Diet:
        return <DietLog />;
      case View.Community:
        return <Community />;
      case View.AIChat:
        return <AIChat onBack={() => setCurrentView(View.Dashboard)} />;
      case View.EvolutionRecord:
        return <EvolutionRecord onBack={() => setCurrentView(View.Stats)} onNavigate={setCurrentView} customPhotos={customPhotos} onUploadPhoto={handleSaveActionCenter} />;
      case View.EvolutionProgress:
        return <EvolutionProgress onBack={() => setCurrentView(View.Dashboard)} />;
      case View.EvolutionGallery: // New case
        return <EvolutionGallery onBack={() => setCurrentView(View.EvolutionRecord)} customPhotos={customPhotos} />;
      case View.ActionCenter:
        return <ActionCenter onClose={() => setCurrentView(View.Dashboard)} onSave={handleSaveActionCenter} />;
      case View.WeightRecord:
        return <WeightRecord onBack={() => setCurrentView(View.Stats)} />;

      // Check-In Flow
      case View.CheckInType:
        return <CheckInType onClose={() => setCurrentView(View.Dashboard)} onNext={() => setCurrentView(View.CheckInSuccess)} />;
      case View.CheckInBody:
        return <CheckInBody onBack={() => setCurrentView(View.CheckInSuccess)} onSave={() => setCurrentView(View.CheckInSuccess)} />;
      case View.CheckInSuccess:
        return <CheckInSuccess onNavigate={setCurrentView} onClose={() => setCurrentView(View.Dashboard)} />;
      case View.CheckInShare:
        return <CheckInShare onClose={() => setCurrentView(View.Dashboard)} />;

      default:
        return <Dashboard />;
    }
  };

  // Views where Floating Advisor should be hidden (Immersive views or the Chat view itself)
  const shouldHideAdvisor =
    currentView === View.Login ||
    currentView === View.Register ||
    currentView === View.Onboarding ||
    currentView === View.Splash ||
    currentView === View.Evolution ||
    currentView === View.AIChat ||
    currentView === View.EvolutionRecord ||
    currentView === View.EvolutionProgress ||
    currentView === View.CheckInType ||
    currentView === View.CheckInBody ||
    currentView === View.CheckInSuccess ||
    currentView === View.CheckInShare ||
    currentView === View.EvolutionGallery ||
    currentView === View.WeightRecord ||
    currentView === View.ActionCenter; // Hide on ActionCenter

  // Views where BottomNav should be hidden
  const shouldHideBottomNav =
    currentView === View.Login ||
    currentView === View.Register ||
    currentView === View.Splash ||
    currentView === View.Onboarding ||
    currentView === View.Evolution ||
    currentView === View.AIChat ||
    currentView === View.EvolutionRecord || // Fixed button overlaps nav
    currentView === View.EvolutionGallery ||
    currentView === View.WeightRecord ||
    currentView === View.ActionCenter;

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-black font-serif italic text-white mb-2">
            Right<span className="text-[#B8FF00]">Now</span>
          </h1>
          <div className="w-6 h-6 border-2 border-[#B8FF00] border-t-transparent rounded-full animate-spin mx-auto mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased bg-black text-white min-h-screen">
      {!shouldHideAdvisor && <FloatingAdvisor hasNotification={hasUnreadAI} onChatClick={() => {
        setHasUnreadAI(false);
        setCurrentView(View.AIChat);
      }} />}
      {renderView()}
      {!shouldHideBottomNav && <BottomNav currentView={currentView} setView={setCurrentView} />}
    </div>
  );
};

export default App;