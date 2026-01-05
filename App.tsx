import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { MockDb } from './services/mockDb';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('teenai_current_user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (email: string, role: UserRole) => {
    let loggedInUser;
    
    if (email.toUpperCase() === 'TEST@TEST.COM') {
      // 테스트 계정은 MockDb에서 생성된 고정된 사용자 정보를 찾음
      const users = JSON.parse(localStorage.getItem('teenai_users') || '[]');
      loggedInUser = users.find((u: User) => u.email === email.toUpperCase() && u.role === role);
    } else if (role === UserRole.PARENT) {
      loggedInUser = await MockDb.loginParent(email);
    } else {
      const users = JSON.parse(localStorage.getItem('teenai_users') || '[]');
      loggedInUser = users.find((u: User) => u.email === email && u.role === UserRole.STUDENT);
    }
    
    if (loggedInUser) {
        setUser(loggedInUser);
        localStorage.setItem('teenai_current_user', JSON.stringify(loggedInUser));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('teenai_current_user');
  };

  if (loading) return <div className="h-screen flex items-center justify-center">로딩 중...</div>;

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  if (user.role === UserRole.STUDENT) {
    return <StudentChat user={user} onLogout={handleLogout} />;
  }

  return <ParentDashboard user={user} onLogout={handleLogout} />;
}

export default App;