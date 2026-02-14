import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { MockDb } from './services/mockDb';
import Auth from './components/Auth';
import StudentChat from './components/StudentChat';
import ParentDashboard from './components/ParentDashboard';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('teenai_current_user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (email: string, password: string, role: UserRole, inviteCode?: string, isSignup?: boolean) => {
    setAuthLoading(true);
    try {
      let loggedInUser;
      
      if (email.toUpperCase() === 'TEST@TEST.COM') {
        // 테스트 계정은 MockDb에서 생성된 고정된 사용자 정보를 찾음
        const users = JSON.parse(localStorage.getItem('teenai_users') || '[]');
        loggedInUser = users.find((u: User) => u.email === email.toUpperCase() && u.role === role);
      } else if (role === UserRole.PARENT) {
        loggedInUser = await MockDb.loginParent(email);
      } else {
        if (isSignup && inviteCode) {
            loggedInUser = await MockDb.registerStudent(email, inviteCode);
        } else {
            const users = JSON.parse(localStorage.getItem('teenai_users') || '[]');
            loggedInUser = users.find((u: User) => u.email === email && u.role === UserRole.STUDENT);
        }
      }
      
      if (loggedInUser) {
          setUser(loggedInUser);
          localStorage.setItem('teenai_current_user', JSON.stringify(loggedInUser));
      } else {
          alert("로그인 정보가 올바르지 않거나 초대 코드가 유효하지 않습니다.");
      }
    } catch (error) {
        console.error("Login Error", error);
        alert("로그인 중 오류가 발생했습니다.");
    } finally {
        setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('teenai_current_user');
  };

  if (loading) return <div className="h-screen flex items-center justify-center">로딩 중...</div>;

  if (!user) {
    return <Auth onLogin={handleLogin} loading={authLoading} />;
  }

  if (user.role === UserRole.STUDENT) {
    return <StudentChat user={user} onLogout={handleLogout} />;
  }

  return <ParentDashboard user={user} onLogout={handleLogout} />;
}

export default App;