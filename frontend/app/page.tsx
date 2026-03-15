"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

declare global {
  interface Window {
    webkitSpeechRecognition: any
  }
}

export default function Page() {

  const [step, setStep] = useState<"upload" | "interview">("upload")
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jd, setJd] = useState("")
  const [result, setResult] = useState<any>(null)

  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [evaluation, setEvaluation] = useState<any>(null)

  const [loading, setLoading] = useState(false)
  const [speakDisabled, setSpeakDisabled] = useState(true)
  const [timer, setTimer] = useState(0)

  const speak = (text: string) => {
    setSpeakDisabled(true)
    const speech = new SpeechSynthesisUtterance(text)
    speech.onend = () => setSpeakDisabled(false)
    window.speechSynthesis.speak(speech)
  }

  const startTimer = (seconds: number) => {
    setTimer(seconds)
    let time = seconds
    const interval = setInterval(() => {
      time--
      setTimer(time)
      if (time <= 0) clearInterval(interval)
    }, 1000)
  }

  const uploadResume = async () => {
    if (!resumeFile) return alert("Upload resume first")
    setLoading(true)

    const formData = new FormData()
    formData.append("file", resumeFile)
    formData.append("jd", jd)

    const res = await fetch("http://127.0.0.1:8000/upload-resume", {
      method: "POST",
      body: formData,
    })

    const data = await res.json()
    setResult(data)
    setLoading(false)
  }

  const startInterview = async () => {
    setStep("interview")
    fetchNextQuestion()
  }

  const fetchNextQuestion = async () => {
    const res = await fetch("http://127.0.0.1:8000/next-question")
    const data = await res.json()

    if (!data.question) {
      const evalRes = await fetch("http://127.0.0.1:8000/evaluate")
      const evalData = await evalRes.json()
      setEvaluation(evalData)
      setQuestion("Interview Finished")
      return
    }

    setQuestion(data.question)
    setAnswer("")
    speak(data.question)
    startTimer(120)
  }

  const listenAnswer = () => {
    const recognition = new window.webkitSpeechRecognition()
    recognition.lang = "en-US"
    recognition.start()

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript
      setAnswer(text)

      await fetch("http://127.0.0.1:8000/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: text }),
      })

      fetchNextQuestion()
    }
  }

  const slideVariants = {
    hidden: { x: 300, opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: -300, opacity: 0 },
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: "#F3E3D0" }}
    >
      <div className="w-full max-w-3xl">

        <h1 className="text-3xl font-bold text-center mb-6"
          style={{ color: "#81A6C6" }}>
          AI Voice Interview Platform
        </h1>

        <AnimatePresence mode="wait">

          {/* UPLOAD */}
          {step === "upload" && (
            <motion.div
              key="upload"
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ type: "spring", stiffness: 100 }}
              className="p-6 rounded-xl shadow-lg space-y-4"
              style={{ backgroundColor: "#AACDDC" }}
            >

              <div>
                <label className="block font-medium mb-1">
                  Upload Resume (PDF)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  className="border p-2 rounded w-full"
                  style={{ borderColor: "#D2C4B4" }}
                />
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Paste Job Description
                </label>
                <textarea
                  rows={6}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  className="border p-2 rounded w-full"
                  style={{ borderColor: "#D2C4B4" }}
                />
              </div>

              <button
                onClick={uploadResume}
                className="px-4 py-2 rounded text-white"
                style={{ backgroundColor: "#81A6C6" }}
              >
                Analyze Resume
              </button>

              {loading && <p>Analyzing resume...</p>}

              {result && (
                <div
                  className="mt-4 p-4 border rounded"
                  style={{ borderColor: "#D2C4B4" }}
                >
                  <h2 className="text-xl font-semibold mb-2">
                    Analysis Result
                  </h2>

                  <p><b>Matched Skills:</b> {result.matched_skills.join(", ")}</p>
                  <p><b>Missing Skills:</b> {result.missing_skills.join(", ")}</p>
                  <p><b>Match Score:</b> {result.match_score}%</p>

                  <button
                    onClick={startInterview}
                    className="mt-3 px-4 py-2 rounded text-white"
                    style={{ backgroundColor: "#81A6C6" }}
                  >
                    Start Interview →
                  </button>
                </div>
              )}

            </motion.div>
          )}

          {/* INTERVIEW */}
          {step === "interview" && (
            <motion.div
              key="interview"
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="p-6 rounded-xl shadow-lg space-y-4"
              style={{ backgroundColor: "#AACDDC" }}
            >

              <h2 className="text-xl font-semibold">Question:</h2>

              <p>{question}</p>

              {timer > 0 && (
                <p>⏱ Time Left: {timer} sec</p>
              )}

              <button
                onClick={listenAnswer}
                disabled={speakDisabled}
                className="px-4 py-2 rounded text-white"
                style={{ backgroundColor: "#81A6C6" }}
              >
                🎤 Speak Answer
              </button>

              {answer && (
                <p>
                  <b>Your Answer:</b> {answer}
                </p>
              )}

              {evaluation && (
                <div>
                  <h2 className="text-xl font-semibold">
                    AI Evaluation
                  </h2>

                  {evaluation.results.map((r: any, i: number) => (
                    <div
                      key={i}
                      className="p-3 border rounded mt-2"
                      style={{ borderColor: "#D2C4B4" }}
                    >
                      <p><b>Q:</b> {r.question}</p>
                      <p><b>A:</b> {r.answer}</p>
                      <pre>{r.evaluation}</pre>
                    </div>
                  ))}

                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}