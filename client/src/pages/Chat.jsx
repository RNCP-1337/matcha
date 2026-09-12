import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Avatar, Empty, Notice, Presence } from '../components/Bits.jsx';
import CallPanel from '../components/CallPanel.jsx';
import MeetupPanel from '../components/MeetupPanel.jsx';
import { clockTime, presenceLabel, relativeTime, shortDate } from '../lib/format.js';
import { useApp } from '../state/AppState.jsx';

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function Chat() {
  const { partnerId } = useParams();
  const navigate = useNavigate();
  const { user, subscribe, refreshCounts } = useApp();

  const [conversations, setConversations] = useState([]);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const bottom = useRef(null);
  const activeId = partnerId ? Number(partnerId) : null;

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get('/api/chat/conversations');
      setConversations(data.items);
      return data.items;
    } catch {
      setConversations([]);
      return [];
    }
  }, []);

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
  }, [loadConversations]);

  const loadThread = useCallback(
    async (id) => {
      setError('');
      try {
        const data = await api.get(`/api/chat/${id}/messages`);
        setThread(data);
        await refreshCounts();
      } catch (problem) {
        setThread(null);
        setError(problem instanceof ApiError ? problem.message : 'Could not open this conversation');
      }
    },
    [refreshCounts],
  );

  useEffect(() => {
    if (activeId) loadThread(activeId);
    else setThread(null);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread?.items?.length]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'message') {
          const message = event.message;
          const involvesActive =
            activeId && (message.senderId === activeId || message.recipientId === activeId);

          if (involvesActive) {
            setThread((current) => {
              if (!current || current.items.some((entry) => entry.id === message.id)) return current;
              return { ...current, items: [...current.items, message] };
            });
            if (message.senderId === activeId) {
              api.get(`/api/chat/${activeId}/messages?limit=1`).then(refreshCounts).catch(() => {});
            }
          }
          loadConversations();
        }

        if (event.type === 'match' || event.type === 'unmatch' || event.type === 'blocked') {
          loadConversations();
          if (activeId) loadThread(activeId);
        }
      }),
    [subscribe, activeId, loadConversations, loadThread, refreshCounts],
  );

  const send = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;

    setSending(true);
    setError('');
    try {
      await api.post(`/api/chat/${activeId}/messages`, { body });
      setDraft('');
      loadConversations();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not send the message');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="loading">Loading your conversations...</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Messages</h1>
        <p>Conversations open once you and another member have liked each other.</p>
      </div>

      <Notice kind="error">{error}</Notice>

      {conversations.length === 0 ? (
        <Empty>
          No connections yet. Head to <Link to="/browse">the suggestions</Link> and like a few profiles.
        </Empty>
      ) : (
        <div className="chat">
          <div className="chat__list">
            {conversations.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`chat__entry${entry.id === activeId ? ' is-active' : ''}`}
                onClick={() => navigate(`/chat/${entry.id}`)}
              >
                <Avatar filename={entry.photo} alt="" />
                <span className="chat__entry-body">
                  <span className="chat__entry-name">
                    <Presence online={entry.isOnline} label={presenceLabel(entry)} />
                    {entry.firstName}
                    {entry.unread > 0 ? <span className="count-pill">{entry.unread}</span> : null}
                  </span>
                  <span className="chat__entry-preview">
                    {entry.lastMessage
                      ? `${entry.lastSenderId === user.id ? 'You: ' : ''}${entry.lastMessage}`
                      : 'Say hello'}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="chat__thread">
            {!thread ? (
              <div className="chat__messages">
                <p className="muted center" style={{ margin: 'auto' }}>
                  Pick a conversation on the left.
                </p>
              </div>
            ) : (
              <>
                <div className="chat__thread-head">
                  <Avatar filename={thread.partner.photo} alt="" />
                  <div>
                    <div className="chat__entry-name">
                      <Presence online={thread.partner.isOnline} label={presenceLabel(thread.partner)} />
                      <Link to={`/profile/${thread.partner.username}`}>
                        {thread.partner.firstName} {thread.partner.lastName}
                      </Link>
                    </div>
                    <div className="small muted">
                      {thread.partner.isOnline
                        ? 'Online now'
                        : `Last seen ${relativeTime(thread.partner.lastSeen)}`}
                    </div>
                  </div>
                </div>

                <div className="chat__messages">
                  {thread.items.length === 0 ? (
                    <p className="muted center" style={{ margin: 'auto' }}>
                      No messages yet. Start the conversation.
                    </p>
                  ) : (
                    thread.items.map((message, index) => {
                      const previous = thread.items[index - 1];
                      const showDate = !previous || !sameDay(previous.createdAt, message.createdAt);

                      return (
                        <div key={message.id}>
                          {showDate ? (
                            <p className="small muted center" style={{ margin: '6px 0' }}>
                              {shortDate(message.createdAt)}
                            </p>
                          ) : null}
                          <div className={`bubble${message.senderId === user.id ? ' bubble--mine' : ''}`}>
                            {message.body}
                            <span className="bubble__time">{clockTime(message.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottom} />
                </div>

                <div className="chat__side">
                  <CallPanel partner={thread.partner} />
                  <MeetupPanel partner={thread.partner} />
                </div>

                <form className="chat__composer" onSubmit={send}>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        send(event);
                      }
                    }}
                    placeholder="Write a message"
                    maxLength={2000}
                    aria-label="Message"
                  />
                  <button className="button" type="submit" disabled={sending || !draft.trim()}>
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
