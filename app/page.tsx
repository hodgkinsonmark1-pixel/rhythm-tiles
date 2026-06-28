'use client'

import React, { useState, useEffect, useRef } from 'react'

interface Song {
  id: string
  name: string
  url: string
  bpm: number
  duration: number
}

interface Tile {
  id: string
  column: number
  startTime: number
  duration: number
  hit: boolean
  accuracy: 'perfect' | 'good' | 'miss' | null
}

interface GameState {
  score: number
  perfect: number
  good: number
  miss: number
  combo: number
  maxCombo: number
  stars: number
  bonusStars: number
}

const DEFAULT_SONGS: Song[] = [
  {
    id: 'test-1',
    name: 'Test Song 1',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    bpm: 120,
    duration: 30,
  },
  {
    id: 'test-2',
    name: 'Test Song 2',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    bpm: 120,
    duration: 30,
  },
]

const COLUMN_COUNT = 4
const EASY_HIT_WINDOW = 200
const STANDARD_HIT_WINDOW = 80

export default function RhythmGame() {
  const [screen, setScreen] = useState<'songSelect' | 'difficultySelect' | 'training' | 'game' | 'gameOver'>('songSelect')
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [difficulty, setDifficulty] = useState<'easy' | 'standard'>('easy')
  const [trainingPhase, setTrainingPhase] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    stars: 0,
    bonusStars: 0,
  })

  const audioRef = useRef<HTMLAudioElement>(null)
  const tilesRef = useRef<Tile[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const playFieldRef = useRef<HTMLDivElement>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [gameProgress, setGameProgress] = useState(0)
  const [isGameActive, setIsGameActive] = useState(false)
  const [highScores, setHighScores] = useState<Record<string, number>>({})
  const [comboPopup, setComboPopup] = useState<{ text: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('rhythmGameScores')
    if (stored) setHighScores(JSON.parse(stored))
  }, [])

  const saveHighScore = (songId: string, score: number) => {
    setHighScores((prev) => {
      const updated = { ...prev, [songId]: Math.max(prev[songId] || 0, score) }
      localStorage.setItem('rhythmGameScores', JSON.stringify(updated))
      return updated
    })
  }

  const getHitWindow = () => (difficulty === 'easy' ? EASY_HIT_WINDOW : STANDARD_HIT_WINDOW)

  const spawnTiles = (song: Song) => {
    const beatDuration = (60 / song.bpm) * 1000
    const startTime = Date.now()

    const spawnLoop = setInterval(() => {
      if (!isGameActive || !audioRef.current) {
        clearInterval(spawnLoop)
        return
      }

      const elapsed = audioRef.current.currentTime * 1000
      if (elapsed > song.duration * 1000) {
        clearInterval(spawnLoop)
        return
      }

      const column = Math.floor(Math.random() * COLUMN_COUNT)
      const newTile: Tile = {
        id: `${Date.now()}-${Math.random()}`,
        column,
        startTime: elapsed,
        duration: Math.random() > 0.7 ? 500 : 0,
        hit: false,
        accuracy: null,
      }

      tilesRef.current.push(newTile)
      setTiles([...tilesRef.current])
    }, beatDuration * 0.75)

    return spawnLoop
  }

  const startGameAnimation = (song: Song) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)

    const animate = () => {
      if (!isGameActive || !audioRef.current) {
        animationFrameRef.current = null
        return
      }

      const currentTime = audioRef.current.currentTime * 1000
      const progress = (currentTime / (song.duration * 1000)) * 100
      setGameProgress(Math.min(progress, 100))

      tilesRef.current = tilesRef.current.filter((tile) => {
        const tileY = (currentTime - tile.startTime) * 0.3
        return tileY < 600
      })
      setTiles([...tilesRef.current])

      if (currentTime >= song.duration * 1000) {
        endGame()
        return
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }

  const hitTile = (tileId: string, x: number, y: number) => {
    const tile = tilesRef.current.find((t) => t.id === tileId)
    if (!tile || tile.hit || !audioRef.current) return

    const currentTime = audioRef.current.currentTime * 1000
    const distance = Math.abs(currentTime - tile.startTime)
    const hitWindow = getHitWindow()

    let accuracy: 'perfect' | 'good' | 'miss'
    let points = 0

    if (distance < hitWindow * 0.3) {
      accuracy = 'perfect'
      points = 300
    } else if (distance < hitWindow) {
      accuracy = 'good'
      points = 150
    } else {
      accuracy = 'miss'
      points = 0
    }

    tile.hit = true
    tile.accuracy = accuracy

    setGameState((prev) => {
      const newState = {
        ...prev,
        score: prev.score + points,
        perfect: accuracy === 'perfect' ? prev.perfect + 1 : prev.perfect,
        good: accuracy === 'good' ? prev.good + 1 : prev.good,
        miss: accuracy === 'miss' ? prev.miss + 1 : prev.miss,
        combo: accuracy !== 'miss' ? prev.combo + 1 : 0,
        maxCombo: prev.combo + 1 > prev.maxCombo ? prev.combo + 1 : prev.maxCombo,
      }

      if (newState.combo % 10 === 0 && newState.combo > 0) {
        setComboPopup({ text: `+2 STARS! ${newState.combo} COMBO!`, x, y })
        setTimeout(() => setComboPopup(null), 1000)
        newState.bonusStars = (newState.bonusStars || 0) + 2
      }

      return newState
    })

    playSound('pop')
  }

  const playSound = (type: 'pop' | 'miss') => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const now = audioContext.currentTime
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()

      osc.connect(gain)
      gain.connect(audioContext.destination)

      if (type === 'pop') {
        osc.frequency.setValueAtTime(800, now)
        gain.gain.setValueAtTime(0.3, now)
      } else {
        osc.frequency.setValueAtTime(200, now)
        gain.gain.setValueAtTime(0.1, now)
      }

      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
      osc.start(now)
      osc.stop(now + 0.1)
    } catch (e) {
      console.log('Sound playback failed:', e)
    }
  }

  const endGame = () => {
    setIsGameActive(false)

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (audioRef.current) audioRef.current.pause()

    const totalHits = gameState.perfect + gameState.good + gameState.miss
    const accuracy = totalHits > 0 ? (gameState.perfect + gameState.good) / totalHits : 0

    let stars = 0
    if (accuracy >= 0.95) stars = 5
    else if (accuracy >= 0.85) stars = 4
    else if (accuracy >= 0.75) stars = 3
    else if (accuracy >= 0.6) stars = 2
    else if (accuracy >= 0.4) stars = 1

    setGameState((prev) => ({ ...prev, stars }))

    if (selectedSong) saveHighScore(selectedSong.id, gameState.score)

    setScreen('gameOver')
  }

  const startGame = (song: Song, diff: 'easy' | 'standard') => {
    setSelectedSong(song)
    setDifficulty(diff)
    setGameState({
      score: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
      stars: 0,
      bonusStars: 0,
    })
    tilesRef.current = []
    setTiles([])
    setGameProgress(0)
    setIsGameActive(true)
    setScreen('game')
  }

  const playGameAudio = (song: Song) => {
    setIsLoading(true)
    console.log('Playing song:', song.url)

    if (!audioRef.current) {
      console.error('Audio ref not available')
      setIsLoading(false)
      return
    }

    audioRef.current.src = song.url
    audioRef.current.currentTime = 0

    const playPromise = audioRef.current.play()

    if (playPromise) {
      playPromise
        .then(() => {
          console.log('Audio started')
          setIsLoading(false)
          spawnTiles(song)
          startGameAnimation(song)

          setTimeout(() => {
            if (isGameActive) endGame()
          }, song.duration * 1000 + 500)
        })
        .catch((err) => {
          console.error('Audio error:', err)
          setIsLoading(false)
          alert('Could not play audio. Check browser settings.')
        })
    }
  }

  const renderGame = () => {
    const hitWindow = getHitWindow()
    const columnWidth = playFieldRef.current ? playFieldRef.current.clientWidth / COLUMN_COUNT : 100

    return (
      <div ref={playFieldRef} className="relative w-full h-full bg-gradient-to-b from-slate-900 to-slate-800 overflow-hidden">
        <div className="absolute top-4 left-4 right-4 h-1 bg-slate-700 rounded-full overflow-hidden z-50">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all" style={{ width: `${gameProgress}%` }} />
        </div>

        <div className="absolute top-8 left-4 right-4 flex justify-between text-white text-sm z-50">
          <div>Score: {gameState.score}</div>
          <div>Combo: {gameState.combo}</div>
        </div>

        <div className="absolute bottom-24 w-full h-20 border-t-2 border-b-2 border-yellow-400 bg-yellow-500/10 flex items-center justify-center text-yellow-400 font-bold text-sm">
          ← HIT ZONE →
        </div>

        {tiles.map((tile) => {
          const tileY = audioRef.current ? (audioRef.current.currentTime * 1000 - tile.startTime) * 0.3 : 0
          const isInHitZone = Math.abs(tileY - (playFieldRef.current?.clientHeight || 400) + 100) < hitWindow

          return (
            <div
              key={tile.id}
              onClick={() => hitTile(tile.id, tile.column * columnWidth + columnWidth / 2, 200)}
              className={`absolute cursor-pointer transition-all ${tile.hit ? 'opacity-0 scale-150' : ''} ${isInHitZone ? 'ring-4 ring-yellow-300' : ''}`}
              style={{
                left: `${tile.column * columnWidth + columnWidth / 2 - 40}px`,
                top: `${tileY}px`,
                width: '80px',
                height: '80px',
              }}
            >
              <div
                className={`w-full h-full rounded-lg flex items-center justify-center text-4xl font-bold text-white shadow-lg ${
                  tile.accuracy === 'perfect'
                    ? 'bg-green-500'
                    : tile.accuracy === 'good'
                      ? 'bg-blue-500'
                      : tile.accuracy === 'miss'
                        ? 'bg-red-500'
                        : 'bg-gradient-to-br from-blue-500 to-purple-600'
                }`}
              >
                ♪
              </div>
            </div>
          )
        })}

        {comboPopup && (
          <div
            className="absolute text-2xl font-bold text-yellow-300 animate-bounce"
            style={{
              left: `${comboPopup.x}px`,
              top: `${comboPopup.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {comboPopup.text}
          </div>
        )}

        <audio ref={audioRef} crossOrigin="anonymous" />
      </div>
    )
  }

  if (screen === 'songSelect') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold text-white mb-8 text-center">🎵 Rhythm Tiles</h1>
        <p className="text-slate-300 text-center mb-12 max-w-md">Choose a song and tap tiles to the beat!</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
          {DEFAULT_SONGS.map((song) => (
            <button
              key={song.id}
              onClick={() => {
                setSelectedSong(song)
                setScreen('difficultySelect')
              }}
              className="p-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg hover:shadow-xl hover:scale-105 transition-all text-white font-bold text-center"
            >
              {song.name}
              {highScores[song.id] && <div className="text-sm mt-2 opacity-90">High Score: {highScores[song.id]}</div>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'difficultySelect' && selectedSong) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-white mb-4">{selectedSong.name}</h1>
        <p className="text-slate-300 mb-12">Choose difficulty</p>

        <div className="flex gap-6">
          <button onClick={() => setScreen('training')} className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-xl transition-all">
            🏋️ Training Mode
          </button>
          <button onClick={() => startGame(selectedSong, 'easy')} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-bold text-xl transition-all">
            Easy
          </button>
          <button onClick={() => startGame(selectedSong, 'standard')} className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-lg text-white font-bold text-xl transition-all">
            Standard
          </button>
        </div>

        <button onClick={() => setScreen('songSelect')} className="mt-8 px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded text-white text-sm">
          Back
        </button>
      </div>
    )
  }

  if (screen === 'training' && selectedSong) {
    const phases = ['Dead Easy', 'Easy', 'Medium', 'Hard']
    const difficultySetting = (['easy', 'easy', 'easy', 'standard'][trainingPhase] as 'easy' | 'standard') || 'easy'

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-white mb-2">Training Mode</h1>
        <p className="text-slate-300 mb-8">
          Phase {trainingPhase + 1}/4: {phases[trainingPhase]}
        </p>

        <button onClick={() => startGame(selectedSong!, difficultySetting)} className="px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-bold text-xl transition-all mb-8">
          Start Phase {trainingPhase + 1}
        </button>

        <button onClick={() => setScreen('difficultySelect')} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded text-white text-sm">
          Back
        </button>
      </div>
    )
  }

  if (screen === 'game' && selectedSong) {
    if (gameProgress === 0) {
      return (
        <div className="w-screen h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
          <button onClick={() => playGameAudio(selectedSong)} disabled={isLoading} className="px-12 py-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg text-white font-bold text-3xl transition-all">
            {isLoading ? '⏳ Loading...' : '🎵 TAP TO START'}
          </button>
        </div>
      )
    }

    return <div className="w-screen h-screen">{renderGame()}</div>
  }

  if (screen === 'gameOver' && selectedSong) {
    const totalHits = gameState.perfect + gameState.good + gameState.miss
    const accuracy = totalHits > 0 ? Math.round(((gameState.perfect + gameState.good) / totalHits) * 100) : 0

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold text-white mb-4">Game Over!</h1>
        <h2 className="text-2xl text-slate-300 mb-8">{selectedSong.name}</h2>

        <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
          <div className="bg-blue-600/30 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-blue-400">{gameState.score}</div>
            <div className="text-sm text-slate-300">Score</div>
          </div>
          <div className="bg-yellow-600/30 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">⭐ {gameState.stars}</div>
            <div className="text-sm text-slate-300">Base Stars</div>
          </div>
          <div className="bg-green-600/30 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-green-400">✓ {gameState.perfect}</div>
            <div className="text-sm text-slate-300">Perfect</div>
          </div>
          <div className="bg-purple-600/30 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-purple-400">💫 {gameState.bonusStars}</div>
            <div className="text-sm text-slate-300">Bonus Stars</div>
          </div>
        </div>

        <div className="text-slate-300 mb-8 text-center">
          <p>Accuracy: {accuracy}%</p>
          <p>Max Combo: {gameState.maxCombo}</p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              if (trainingPhase < 3) {
                setTrainingPhase(trainingPhase + 1)
                setScreen('training')
              } else {
                startGame(selectedSong, 'standard')
              }
            }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-bold transition-all"
          >
            Play Again
          </button>
          <button onClick={() => setScreen('songSelect')} className="px-6 py-3 bg-slate-600 hover:bg-slate-700 rounded-lg text-white font-bold transition-all">
            Change Song
          </button>
        </div>
      </div>
    )
  }

  return null
}
