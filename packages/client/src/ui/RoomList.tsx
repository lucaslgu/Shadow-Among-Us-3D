import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useNetworkStore } from '../stores/network-store.js';
import * as s from './styles.js';

export function RoomList() {
  const playerName = useNetworkStore((st) => st.playerName);
  const roomList = useNetworkStore((st) => st.roomList);
  const roomListPage = useNetworkStore((st) => st.roomListPage);
  const roomListTotalPages = useNetworkStore((st) => st.roomListTotalPages);
  const roomListTotal = useNetworkStore((st) => st.roomListTotal);
  const roomListLoading = useNetworkStore((st) => st.roomListLoading);
  const requestRoomList = useNetworkStore((st) => st.requestRoomList);
  const joinRoom = useNetworkStore((st) => st.joinRoom);
  const setPendingJoinRoom = useNetworkStore((st) => st.setPendingJoinRoom);
  const roomError = useNetworkStore((st) => st.roomError);
  const navigate = useNavigate();

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    requestRoomList(1);
  }, [requestRoomList, refreshKey]);

  if (playerName.trim().length < 2) return <Navigate to="/" replace />;

  function handleJoinClick(room: (typeof roomList)[0]) {
    if (room.hasPassword) {
      setPendingJoinRoom(room);
      navigate(`/enter-room/${room.roomCode}`);
    } else {
      joinRoom(room.roomCode);
    }
  }

  function handlePageChange(page: number) {
    requestRoomList(page);
  }

  return (
    <div style={s.overlay}>
      <div style={s.cardWide}>
        <button style={s.backButton} onClick={() => navigate('/')}>
          &larr; Back to Menu
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <div style={s.title}>Available Rooms</div>
          <button
            style={{
              ...s.backButton,
              marginBottom: 0,
              color: s.colors.primary,
              fontSize: 14,
            }}
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </button>
        </div>
        <div style={s.subtitle}>
          {roomListTotal} room{roomListTotal !== 1 ? 's' : ''} available
        </div>

        {/* Room List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 280 }}>
          {roomListLoading && roomList.length === 0 && (
            <div style={{ textAlign: 'center', color: s.colors.textMuted, padding: 40 }}>
              Loading rooms...
            </div>
          )}

          {!roomListLoading && roomList.length === 0 && (
            <div style={{ textAlign: 'center', color: s.colors.textMuted, padding: 40 }}>
              No rooms available. Create one!
            </div>
          )}

          {roomList.map((room) => (
            <div
              key={room.roomCode}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: s.colors.bg,
                border: `1px solid ${s.colors.border}`,
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  <span>{room.roomCode}</span>
                  {room.hasPassword && (
                    <span style={{ fontSize: 12, color: s.colors.warning }} title="Password protected">
                      LOCKED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: s.colors.textMuted, marginTop: 2 }}>
                  Host: {room.hostName}
                </div>
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: s.colors.textMuted,
                  marginRight: 16,
                  whiteSpace: 'nowrap',
                }}
              >
                {room.playerCount}/{room.maxPlayers}
              </div>

              <button
                style={{
                  padding: '6px 16px',
                  background: s.colors.primary,
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => handleJoinClick(room)}
                onMouseOver={(e) => (e.currentTarget.style.background = s.colors.primaryHover)}
                onMouseOut={(e) => (e.currentTarget.style.background = s.colors.primary)}
              >
                Join
              </button>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {roomListTotalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 16,
            }}
          >
            <button
              style={{
                ...s.backButton,
                marginBottom: 0,
                color: roomListPage > 1 ? s.colors.text : s.colors.textMuted,
                cursor: roomListPage > 1 ? 'pointer' : 'default',
              }}
              disabled={roomListPage <= 1}
              onClick={() => handlePageChange(roomListPage - 1)}
            >
              &larr; Prev
            </button>

            <span style={{ fontSize: 13, color: s.colors.textMuted }}>
              Page {roomListPage} of {roomListTotalPages}
            </span>

            <button
              style={{
                ...s.backButton,
                marginBottom: 0,
                color: roomListPage < roomListTotalPages ? s.colors.text : s.colors.textMuted,
                cursor: roomListPage < roomListTotalPages ? 'pointer' : 'default',
              }}
              disabled={roomListPage >= roomListTotalPages}
              onClick={() => handlePageChange(roomListPage + 1)}
            >
              Next &rarr;
            </button>
          </div>
        )}

        {roomError && <div style={s.errorText}>{roomError}</div>}
      </div>
    </div>
  );
}
