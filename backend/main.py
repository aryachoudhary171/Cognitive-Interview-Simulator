from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pdfplumber
import boto3

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Amazon Nova Client --------
bedrock = boto3.client(
    service_name="bedrock-runtime",
    region_name="us-east-1"
)

def call_nova(prompt: str) -> str:
    try:
        response = bedrock.converse(
            modelId="amazon.nova-lite-v1:0",
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 500, "temperature": 0.7}
        )
        content = response["output"]["message"]["content"][0]["text"]
        return content.strip()
    except Exception as e:
        print("Nova API error:", e)
        return ""

# -------- Skill Extraction --------
def extract_skills(text: str) -> list[str]:
    if not text.strip():
        return []
    prompt = f"""
Extract all technical skills from the following text.

Return ONLY a comma separated list.

Text:
{text}
"""
    skills_text = call_nova(prompt)
    skills = [s.strip().lower() for s in skills_text.split(",") if s.strip()]
    return skills

# -------- Interview Memory --------
interview_questions = []
interview_answers = []
current_q = 0

# -------- Resume Upload + JD --------
@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...), jd: str = Form(...)):
    global interview_questions, interview_answers, current_q

    # -------- Extract text from PDF --------
    text = ""
    try:
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        return {"error": f"PDF extraction failed: {e}"}

    # -------- Extract Skills --------
    resume_skills = extract_skills(text)
    jd_skills = extract_skills(jd)

    # -------- Match / Missing --------
    matched = [s for s in jd_skills if s in resume_skills]
    missing = [s for s in jd_skills if s not in resume_skills]

    score = int((len(matched) / len(jd_skills)) * 100) if jd_skills else 0

    # -------- Generate Interview Questions --------
    prompt = f"""
You are a technical interviewer.

Candidate Resume Skills:
{', '.join(resume_skills)}

Job Description Required Skills:
{', '.join(jd_skills)}

Skills missing in resume but required in job:
{', '.join(missing)}

Generate 6 interview questions:
1 question from candidate resume skills
2 questions from job description skills
2 technical questions combining resume and JD skills
1 scenario-based question

Return ONLY the questions separated by newline.
"""
    nova_response = call_nova(prompt)
    interview_questions = [q.strip().lstrip("1234567890. ") for q in nova_response.split("\n") if q.strip()]

    # fallback if Nova fails
    if not interview_questions:
        interview_questions = [
            "Tell me about yourself.",
            "Explain one project you worked on.",
            "What technologies have you used recently?",
            "What challenges did you face in your project?",
            "Why should we hire you?"
        ]

    interview_answers = []
    current_q = 0

    return {
        "matched_skills": matched,
        "missing_skills": missing,
        "match_score": score,
        "questions": interview_questions
    }

# -------- Next Question --------
@app.get("/next-question")
def next_question():
    global current_q
    if current_q >= len(interview_questions):
        return {"question": None}
    return {"question": interview_questions[current_q]}

# -------- Answer Model --------
class Answer(BaseModel):
    answer: str

# -------- Save Answer --------
@app.post("/answer")
def answer(data: Answer):
    global current_q
    if current_q >= len(interview_questions):
        return {"status": "interview_finished"}
    question = interview_questions[current_q]
    interview_answers.append({"question": question, "answer": data.answer})
    current_q += 1
    return {"status": "saved"}

# -------- Evaluation --------
@app.get("/evaluate")
def evaluate():
    results = []
    for qa in interview_answers:
        prompt = f"""
Evaluate this interview answer.

Question:
{qa['question']}

Answer:
{qa['answer']}

Return:

Score (1-10)
Fluency (1-10)
Feedback
"""
        evaluation = call_nova(prompt)
        results.append({
            "question": qa["question"],
            "answer": qa["answer"],
            "evaluation": evaluation
        })
    return {"results": results}