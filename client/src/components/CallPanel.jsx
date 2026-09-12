import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

const LABELS = {
  idle: '',
  calling: 'Ringing...',
  incoming: 'Incoming call',
  connecting: 'Connecting...',
  live: 'Connected',
};

async function permissionState(name) {
  try {
    return (await navigator.permissions.query({ name })).state;
  } catch {
    return 'unknown';
  }
}

// getUserMedia only reports a generic error name, so the permission state is read back to tell
// the viewer which of the two gatekeepers said no: this site's setting, or the operating system.
async function explainMediaError(problem, kind, fallback) {
  const device = kind === 'video' ? 'camera and microphone' : 'microphone';

  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Calls need a secure address. Open the site through localhost or an https:// address.';
  }

  if (problem?.name === 'NotFoundError' || problem?.name === 'OverconstrainedError') {
    return kind === 'video'
      ? 'No camera or microphone was found on this device. An audio call may still work.'
      : 'No microphone was found on this device.';
  }

  if (problem?.name === 'NotReadableError' || problem?.name === 'AbortError') {
    return `Your ${kind === 'video' ? 'camera' : 'microphone'} is being used by another application. Close it and try again.`;
  }

  if (problem?.name === 'NotAllowedError' || problem?.name === 'SecurityError') {
    const states = await Promise.all((kind === 'video' ? ['camera', 'microphone'] : ['microphone']).map(permissionState));

    if (states.includes('denied')) {
      return `This site is blocked from using your ${device}. Click the icon at the left of the address bar, allow the ${device}, then try again.`;
    }
    if (/system/i.test(problem.message || '') || states.every((state) => state === 'granted')) {
      return `Your computer is not letting the browser use the ${device}. On a Mac, open System Settings → Privacy & Security → Camera and Microphone, turn your browser on, then restart it.`;
    }
    if (states.includes('prompt')) {
      return `The browser asked to use your ${device} and permission was not given. Try again and choose Allow.`;
    }
    return `Access to your ${device} was refused. Allow it from the icon at the left of the address bar; on a Mac, also check System Settings → Privacy & Security.`;
  }

  return fallback;
}

export default function CallPanel({ partner }) {
  const { subscribe, send } = useApp();

  const peer = useRef(null);
  const localStream = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pendingIce = useRef([]);

  const [state, setState] = useState('idle');
  const [remoteStream, setRemoteStream] = useState(null);
  const [media, setMedia] = useState('video');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const partnerId = partner?.id;

  const teardown = useCallback(() => {
    peer.current?.close();
    peer.current = null;
    pendingIce.current = [];

    for (const track of localStream.current?.getTracks() ?? []) track.stop();
    localStream.current = null;

    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;

    setRemoteStream(null);
    setState('idle');
    setMuted(false);
    setCameraOff(false);
  }, []);

  useEffect(() => teardown, [partnerId, teardown]);

  const createPeer = useCallback(
    (target) => {
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      connection.onicecandidate = (event) => {
        if (event.candidate) send({ type: 'call:ice', to: target, candidate: event.candidate });
      };

      connection.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') {
          setState('live');
          return;
        }
        if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
          setError(connection.connectionState === 'failed' ? 'The connection dropped.' : '');
          teardown();
        }
      };

      peer.current = connection;
      return connection;
    },
    [send, teardown],
  );

  const captureLocal = useCallback(async (kind) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    localStream.current = stream;
    return stream;
  }, []);

  useEffect(() => {
    if (remoteVideo.current && remoteStream) remoteVideo.current.srcObject = remoteStream;
  }, [remoteStream, state]);

  useEffect(() => {
    if (localVideo.current && localStream.current) localVideo.current.srcObject = localStream.current;
  }, [state, media]);

  const start = async (kind) => {
    setError('');
    setMedia(kind);
    setState('calling');

    try {
      const stream = await captureLocal(kind);
      const connection = createPeer(partnerId);
      for (const track of stream.getTracks()) connection.addTrack(track, stream);

      const offer = await connection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: kind === 'video' });
      await connection.setLocalDescription(offer);
      send({ type: 'call:offer', to: partnerId, sdp: offer, media: kind });
    } catch (problem) {
      setError(await explainMediaError(problem, kind, 'Could not start the call.'));
      teardown();
    }
  };

  const answer = async () => {
    setError('');
    setState('connecting');

    try {
      const stream = await captureLocal(media);
      const connection = peer.current;
      for (const track of stream.getTracks()) connection.addTrack(track, stream);

      const description = await connection.createAnswer();
      await connection.setLocalDescription(description);
      send({ type: 'call:answer', to: partnerId, sdp: description });

      for (const candidate of pendingIce.current) await connection.addIceCandidate(candidate).catch(() => {});
      pendingIce.current = [];
    } catch (problem) {
      setError(await explainMediaError(problem, media, 'Could not answer the call.'));
      send({ type: 'call:decline', to: partnerId });
      teardown();
    }
  };

  const hangUp = () => {
    if (state === 'incoming') send({ type: 'call:decline', to: partnerId });
    else if (state !== 'idle') send({ type: 'call:end', to: partnerId });
    teardown();
  };

  useEffect(
    () =>
      subscribe(async (event) => {
        if (!partnerId) return;

        if (event.type === 'call:unavailable' && event.to === partnerId) {
          setError(`${partner.firstName} is not online right now.`);
          teardown();
          return;
        }

        if (event.type === 'call:refused') {
          setError(event.reason || 'That call was refused.');
          teardown();
          return;
        }

        if (event.from !== partnerId) return;

        if (event.type === 'call:offer') {
          if (peer.current) {
            send({ type: 'call:busy', to: partnerId });
            return;
          }
          setMedia(event.media === 'audio' ? 'audio' : 'video');
          const connection = createPeer(partnerId);
          await connection.setRemoteDescription(new RTCSessionDescription(event.sdp));
          setState('incoming');
          return;
        }

        if (event.type === 'call:answer' && peer.current) {
          setState('connecting');
          await peer.current.setRemoteDescription(new RTCSessionDescription(event.sdp));
          for (const candidate of pendingIce.current) await peer.current.addIceCandidate(candidate).catch(() => {});
          pendingIce.current = [];
          return;
        }

        if (event.type === 'call:ice' && event.candidate) {
          const candidate = new RTCIceCandidate(event.candidate);
          if (peer.current?.remoteDescription) await peer.current.addIceCandidate(candidate).catch(() => {});
          else pendingIce.current.push(candidate);
          return;
        }

        if (['call:end', 'call:decline', 'call:busy'].includes(event.type)) {
          if (event.type === 'call:decline') setError(`${partner.firstName} declined the call.`);
          if (event.type === 'call:busy') setError(`${partner.firstName} is already on a call.`);
          teardown();
        }
      }),
    [subscribe, partnerId, partner?.firstName, createPeer, send, teardown],
  );

  const toggleMute = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  };

  if (!partner) return null;

  return (
    <div className="call">
      {error ? <p className="notice notice--error" style={{ marginBottom: 10 }}>{error}</p> : null}

      {state === 'idle' ? (
        <div className="button-row">
          <button className="button button--secondary button--small" type="button" onClick={() => start('video')}>
            Video call
          </button>
          <button className="button button--secondary button--small" type="button" onClick={() => start('audio')}>
            Audio call
          </button>
        </div>
      ) : (
        <div className={`call__live${state === 'incoming' ? ' call--incoming' : ''}`}>
          <div className="call__bar">
            <div className="call__status">
              <strong>{LABELS[state]}</strong>
              <span className="small muted">
                {media === 'video' ? 'Video' : 'Audio'} call with {partner.firstName}
              </span>
            </div>

            <div className="button-row">
              {state === 'incoming' ? (
                <button className="button button--small" type="button" onClick={answer}>
                  Answer
                </button>
              ) : null}
              {state === 'live' ? (
                <>
                  <button className="button button--secondary button--small" type="button" onClick={toggleMute}>
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  {media === 'video' ? (
                    <button className="button button--secondary button--small" type="button" onClick={toggleCamera}>
                      {cameraOff ? 'Camera on' : 'Camera off'}
                    </button>
                  ) : null}
                </>
              ) : null}
              <button className="button button--danger button--small" type="button" onClick={hangUp}>
                {state === 'incoming' ? 'Decline' : 'Hang up'}
              </button>
            </div>
          </div>

          {state !== 'incoming' && media === 'video' ? (
            <div className="call__streams">
              <video ref={remoteVideo} className="call__remote" autoPlay playsInline />
              {!remoteStream ? (
                <span className="call__waiting">
                  {state === 'calling' ? `Waiting for ${partner.firstName} to answer...` : 'Connecting...'}
                </span>
              ) : null}
              <video ref={localVideo} className="call__local" autoPlay playsInline muted />
            </div>
          ) : null}
          {state !== 'incoming' && media === 'audio' ? <audio ref={remoteVideo} autoPlay /> : null}
        </div>
      )}
    </div>
  );
}
