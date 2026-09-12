import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const AppContext = createContext(null);

const NOTIFICATION_TEXT = {
  like: 'liked your profile',
  visit: 'looked at your profile',
  message: 'sent you a message',
  match: 'is connected with you',
  unlike: 'removed their like',
  meetup: 'updated a meetup with you',
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [toasts, setToasts] = useState([]);

  const listeners = useRef(new Set());
  const socket = useRef(null);
  const retry = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (toast) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismissToast(id), 7000);
    },
    [dismissToast],
  );

  const refreshCounts = useCallback(async () => {
    try {
      const data = await api.get('/api/notifications/summary');
      setCounts({ notifications: data.notifications, messages: data.messages });
    } catch {
      setCounts({ notifications: 0, messages: 0 });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api.get('/api/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const handleEvent = useCallback(
    (payload) => {
      for (const listener of listeners.current) listener(payload);

      if (payload.type === 'notification') {
        setCounts((current) => ({ ...current, notifications: current.notifications + 1 }));
        const actor = payload.notification?.actor_username || 'Someone';
        addToast({
          text: `${actor} ${NOTIFICATION_TEXT[payload.notification?.type] || 'interacted with your profile'}`,
          href: payload.notification?.actor_username ? `/profile/${payload.notification.actor_username}` : null,
        });
      }

      if (payload.type === 'message' && payload.message?.recipientId === user?.id) {
        setCounts((current) => ({ ...current, messages: current.messages + 1 }));
      }
    },
    [addToast, user?.id],
  );

  useEffect(() => {
    let cancelled = false;

    api
      .get('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setCounts({ notifications: 0, messages: 0 });
      if (socket.current) {
        socket.current.close();
        socket.current = null;
      }
      return undefined;
    }

    refreshCounts();

    let closed = false;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.current = ws;

      ws.onmessage = (event) => {
        try {
          handleEvent(JSON.parse(event.data));
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        if (closed) return;
        retry.current = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(retry.current);
      if (socket.current) {
        socket.current.onclose = null;
        socket.current.close();
        socket.current = null;
      }
    };
  }, [user, handleEvent, refreshCounts]);

  const send = useCallback((payload) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const signIn = useCallback(async (credentials) => {
    const data = await api.post('/api/auth/login', credentials);
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      ready,
      counts,
      setCounts,
      refreshCounts,
      refreshUser,
      signIn,
      signOut,
      subscribe,
      send,
      toasts,
      addToast,
      dismissToast,
    }),
    [
      user,
      ready,
      counts,
      refreshCounts,
      refreshUser,
      signIn,
      signOut,
      subscribe,
      send,
      toasts,
      addToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
