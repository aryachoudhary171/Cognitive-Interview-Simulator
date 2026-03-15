"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Pie } from "react-chartjs-2"
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js"

ChartJS.register(ArcElement, Tooltip, Legend)

declare global {
  interface Window {
    webkitSpeechRecognition: any
  }
}

// ---------------------- Types ----------------------
interface ResumeResult {
  match_score: number
  matched_skills: string[]
  missing_skills: string[]
}

interface EvaluationResult {
  question: string
  score: number
  feedback: string
}

interface Evaluation {
  results: EvaluationResult[]
}

interface QuestionData {
  question?: string
}

// ---------------------- Main Component ----------------------
export default function Page() {
  const [step, setStep] = useState<"upload" | "interview">("upload")
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jd, setJd] = useState("")
  const [result, setResult] = useState<ResumeResult | null>(null)

  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)

  const [loading, setLoading] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const [timer, setTimer] = useState(0)
  const [speakDisabled, setSpeakDisabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)

  const [countdown, setCountdown] = useState<number | null>(null)
  const [showCountdown, setShowCountdown] = useState(false)

  const timerRef = useRef<NodeJS.Timer | null>(null)
  const recognitionRef = useRef<any>(null)

  // ---------------------- Helpers ----------------------
  const cleanText = (text: string) => text.replace(/\*/g, "")
  const extractScore = (text: string) => {
    const match = text.match(/Score:\s*(\d+)/i)
    return match ? Number(match[1]) : 0
  }

  const typeQuestion = (text: string) => {
    setQuestion("")
    let index = 0
    const interval = setInterval(() => {
      setQuestion(text.slice(0, index + 1))
      index++
      if (index >= text.length) clearInterval(interval)
    }, 25)
  }

  const speak = (text: string) => {
    setSpeakDisabled(true)
    window.speechSynthesis.cancel()
    const speech = new SpeechSynthesisUtterance(text)
    speech.rate = 1
    speech.pitch = 1
    setAiSpeaking(true)
    speech.onend = () => {
      setSpeakDisabled(false)
      setAiSpeaking(false)
    }
    window.speechSynthesis.speak(speech)
  }

  // ---------------------- Timer ----------------------
  const startTimer = (duration = 30) => {
    clearInterval(timerRef.current as any)
    let time = duration
    setTimer(time)
    timerRef.current = setInterval(() => {
      time--
      setTimer(time)
      if (time <= 0) {
        clearInterval(timerRef.current as any)
        if (recognitionRef.current) recognitionRef.current.stop()
        setIsListening(false)
        fetchNextQuestion()
      }
    }, 1000)
  }
  const stopTimer = () => clearInterval(timerRef.current as any)

  // ---------------------- Resume Upload ----------------------
  const uploadResume = async () => {
    if (!resumeFile) {
      alert("Upload resume first")
      return
    }
    try {
      setLoading(true)
      const formData = new FormData()
      formData.append("file", resumeFile)
      formData.append("jd", jd)
      const res = await fetch("http://127.0.0.1:8000/upload-resume", { method: "POST", body: formData })
      const data = await res.json()
      setResult(data || { match_score: 75, matched_skills: ["React", "TypeScript"], missing_skills: ["NestJS"] })
    } catch (err) {
      console.log(err)
      alert("Resume analysis failed")
      setResult({ match_score: 75, matched_skills: ["React", "TypeScript"], missing_skills: ["NestJS"] })
    } finally {
      setLoading(false)
    }
  }

  // ---------------------- Interview Logic ----------------------
  const startInterview = () => {
    setStep("interview")
    setShowCountdown(true)
    let count = 3
    setCountdown(count)
    const interval = setInterval(() => {
      count--
      if (count === 0) {
        clearInterval(interval)
        setShowCountdown(false)
        fetchNextQuestion()
      } else setCountdown(count)
    }, 1000)
  }

  const fetchNextQuestion = async () => {
    clearInterval(timerRef.current as any)
    try {
      const res = await fetch("http://127.0.0.1:8000/next-question")
      const data: QuestionData = await res.json()
      if (!data.question) {
        setQuestion("Interview Completed")
        setEvaluating(true)
        const evalRes = await fetch("http://127.0.0.1:8000/evaluate")
        const evalData = await evalRes.json()
        const cleaned: EvaluationResult[] = evalData.results.map((r: any) => {
          const text = r.feedback || r.evaluation || ""
          return {
            question: r.question,
            score: r.score ?? extractScore(text),
            feedback: cleanText(text)
          }
        })
        setEvaluation({ results: cleaned })
        setEvaluating(false)
        return
      }
      setAnswer("")
      setTimer(0)
      typeQuestion(data.question)
      speak(data.question)
    } catch (err) {
      console.log("Next question fetch failed:", err)
      setQuestion("What is React?")
      speak("What is React?")
    }
  }

  // ---------------------- Speech Recognition ----------------------
  const listenAnswer = () => {
    if (isListening) return
    setIsListening(true)

    const recognition = new window.webkitSpeechRecognition()
    recognitionRef.current = recognition
    recognition.lang = "en-US"
    recognition.continuous = true
    recognition.interimResults = true

    let finalTranscript = ""
    let silenceTimer: any

    const stopListeningAndSubmit = async () => {
      recognition.stop()
      setIsListening(false)
      stopTimer()
      setAnswer(finalTranscript)
      try {
        await fetch("http://127.0.0.1:8000/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: finalTranscript })
        })
      } catch (err) {
        console.log("Answer submission failed:", err)
      }
      fetchNextQuestion()
    }

    const resetSilenceTimer = () => {
      clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => stopListeningAndSubmit(), 2000)
    }

    recognition.start()
    startTimer()

    recognition.onresult = (event: any) => {
      let transcript = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      finalTranscript = transcript
      setAnswer(finalTranscript)
      resetSilenceTimer()
    }

    recognition.onerror = () => {
      setIsListening(false)
      stopTimer()
    }

    recognition.onend = () => clearTimeout(silenceTimer)
  }

  // ---------------------- Evaluation Pie ----------------------
  const scores = evaluation ? evaluation.results.map(r => r.score) : []
  const avgScore = evaluation && scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : result?.match_score || 0

  const pieData = {
    labels: ["Score", "Remaining"],
    datasets: [{ data: [avgScore, 100 - avgScore], backgroundColor: ["#8A7650", "#ECE7D1"], borderWidth: 0 }]
  }

  // ---------------------- Animations ----------------------
  const slideVariants = { hidden: { x: 200, opacity: 0 }, visible: { x: 0, opacity: 1 }, exit: { x: -200, opacity: 0 } }

  // ---------------------- JSX ----------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200 relative overflow-hidden">
      {/* NAVBAR */}
      <div className="w-full bg-gradient-to-r from-slate-800 to-teal-700 text-white shadow-md sticky top-0 z-50">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-xl">🤖</div>
            <h1 className="text-xl font-semibold tracking-wide">AI Interview Simulator</h1>
          </div>
          <p className="text-sm text-gray-300">Practice. Improve. Crack Interviews</p>
        </div>
      </div>

      <div className="flex justify-center items-center min-h-[calc(100vh-64px)] p-8">
        <div className="w-full max-w-4xl">
          <AnimatePresence mode="wait">
            {/* UPLOAD */}
            {step === "upload" && (
              <motion.div key="upload" variants={slideVariants} initial="hidden" animate="visible" exit="exit"
                className="bg-white p-10 rounded-2xl shadow-2xl space-y-6 max-w-xl mx-auto border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800 text-center">Upload Your Resume</h2>
                <p className="text-gray-500 text-center">Get AI-powered feedback and start practicing your interview</p>
                <div className="space-y-2">
                  <label className="font-semibold text-gray-700">Resume (PDF)</label>
                  <input type="file" accept="application/pdf"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition" />
                </div>
                <div className="space-y-2">
                  <label className="font-semibold text-gray-700">Job Description</label>
                  <textarea rows={6} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the JD here..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition resize-none" />
                </div>
                <button onClick={uploadResume} className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 rounded-lg shadow-lg transition transform hover:-translate-y-0.5">
                  {loading ? "Analyzing..." : "Analyze Resume"}
                </button>

                {/* RIGHT DRAWER */}
                {result && (
                  <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} transition={{ duration: 0.4 }}
                    className="fixed right-0 top-[64px] h-[calc(100vh-64px)] w-[380px] bg-white shadow-2xl p-6 overflow-y-auto">
                    <h2 className="text-xl font-semibold mb-4">Resume Analysis</h2>
                    <p className="text-sm mb-1">Match Score</p>
                    <div className="w-full bg-gray-200 h-3 rounded">
                      <div className="bg-green-600 h-3 rounded" style={{ width: `${result.match_score}%` }}></div>
                    </div>
                    <p className="mt-1 text-sm">{result.match_score}% Match</p>

                    <div className="mt-6">
                      <h3 className="font-semibold mb-2">Matched Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.matched_skills.map((skill, i) => (
                          <span key={i} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">{skill}</span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <h3 className="font-semibold mb-2">Missing Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.missing_skills.map((skill, i) => (
                          <span key={i} className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">{skill}</span>
                        ))}
                      </div>
                    </div>

                    <button onClick={startInterview} className="mt-8 w-full bg-emerald-600 text-white py-2 rounded">
                      Start AI Interview
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* INTERVIEW */}
            {step === "interview" && (
              <motion.div key="interview" variants={slideVariants} initial="hidden" animate="visible" exit="exit"
                className="bg-white p-8 rounded-xl shadow-lg space-y-5">
                <div className="flex justify-center mb-4">
                  <motion.div animate={{ scale: aiSpeaking ? 1.1 : 1 }} transition={{ repeat: aiSpeaking ? Infinity : 0, duration: 0.6 }}
                    className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center text-white text-3xl shadow-lg">🤖</motion.div>
                </div>

                {showCountdown ? (
                  <div className="text-center">
                    <p className="text-gray-500">Interview Starting In</p>
                    <motion.div key={countdown} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }}
                      className="text-6xl font-bold text-blue-600">{countdown}</motion.div>
                  </div>
                ) : (
                  <>
                    <p>{question}</p>
                    {timer > 0 && (<p className="text-red-500">⏱ {timer} sec</p>)}
                    <div className="flex justify-center">
                      <button onClick={listenAnswer} disabled={isListening || speakDisabled}
                        className={`px-6 py-2 rounded-lg text-white ${isListening ? "bg-gray-400" : "bg-emerald-600"}`}>
                        🎤 Speak Answer
                      </button>
                    </div>
                    {answer && (<p><b>Your Answer:</b> {answer}</p>)}
                    {evaluating && (<p>Generating interview evaluation...</p>)}

                    {evaluation && (
                      <div className="mt-8 space-y-6">
                        <div className="bg-slate-50 p-6 rounded-xl shadow text-center">
                          <h2 className="text-xl font-semibold mb-3">Final Interview Score</h2>
                          <div className="w-48 mx-auto"><Pie data={pieData} /></div>
                          <p className="mt-3 text-3xl font-bold text-green-600">{avgScore}%</p>
                          <p className="text-sm text-gray-500">Overall AI Evaluation</p>
                        </div>

                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                          {evaluation.results.map((r, i) => (
                            <div key={i} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition">
                              <p className="font-semibold text-gray-800 mb-2">Q{i + 1}. {r.question}</p>
                              <div className="mb-3">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-gray-500">Score</span>
                                  <span className="font-semibold text-blue-600">{r.score}/100</span>
                                </div>
                                <div className="w-full bg-gray-200 h-2 rounded">
                                  <div className="bg-blue-600 h-2 rounded" style={{ width: `${r.score}%` }}></div>
                                </div>
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                {r.feedback.split(/\n|\./).map(line => line.trim()).filter(line => line.length > 15).map((line, index) => (
                                  <div key={index} className="flex gap-2"><span className="text-blue-500">•</span><span>{line}</span></div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}