'use client';
import { Music2, Play, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { MUSIC_TRACKS } from '@/game/music-tracks';
import type { Soundtrack } from '@/hooks/use-soundtrack';
import './soundtrack.css';

export default function SoundControls({ soundtrack, muted, onToggleSound }: { soundtrack: Soundtrack; muted: boolean; onToggleSound: () => void }) {
  const { track, volume, status } = soundtrack;
  return <div className="sound-controls">
    <button type="button" className="icon-button" onClick={onToggleSound} aria-label={muted ? 'Turn sound on' : 'Mute all sound'} aria-pressed={muted} title={muted ? 'Turn sound on' : 'Mute all sound'}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
    <Popover>
      <PopoverTrigger className="icon-button soundtrack-trigger" aria-label="Music settings" title="Music settings"><Music2 size={18}/></PopoverTrigger>
      <PopoverContent className="soundtrack-panel" align="end" sideOffset={10} onKeyDown={event => event.stopPropagation()}>
        <PopoverTitle className="soundtrack-title">Bay radio</PopoverTitle>
        <div className="soundtrack-now"><span>{muted ? 'SOUND MUTED' : volume === 0 ? 'MUSIC OFF' : status === 'playing' ? 'NOW PLAYING' : status === 'paused' ? 'PAUSED' : status === 'loading' ? 'TUNING IN…' : 'SOUNDTRACK'}</span><strong>{track.title}</strong><a href={track.artistUrl} target="_blank" rel="noreferrer">{track.artist}</a></div>
        <div className="soundtrack-actions">{(status === 'ready' || status === 'blocked' || status === 'error') && !muted && volume > 0 && <button type="button" onClick={() => soundtrack.retry()}><Play size={15}/>{status === 'error' ? 'Retry music' : 'Play music'}</button>}<button type="button" onClick={() => soundtrack.next()}><SkipForward size={16}/>Next track</button></div>
        {status === 'error' && <output className="soundtrack-error">Music couldn’t load. Try again when you’re connected.</output>}
        <div className="soundtrack-volume"><div><span id="music-volume-label">Music volume</span><output>{Math.round(volume * 100)}%</output></div><Slider aria-labelledby="music-volume-label" value={[Math.round(volume * 100)]} min={0} max={100} step={5} onValueChange={value => soundtrack.setVolume((Array.isArray(value) ? value[0] : value) / 100)}/></div>
        <details className="soundtrack-credits"><summary>Music credits · {MUSIC_TRACKS.length} tracks</summary><ul>{MUSIC_TRACKS.map(song => <li key={song.id}><a href={song.sourceUrl} target="_blank" rel="noreferrer">{song.title}</a><span><a href={song.artistUrl} target="_blank" rel="noreferrer">{song.artist}</a> · <a href={song.licenseUrl} target="_blank" rel="noreferrer">{song.license}</a></span></li>)}</ul><p>From OpenGameArt. Converted to MP3 and loudness normalized.</p><a href="/audio/music/CREDITS.md" target="_blank" rel="noreferrer">Full credits &amp; source details</a></details>
      </PopoverContent>
    </Popover>
  </div>;
}
