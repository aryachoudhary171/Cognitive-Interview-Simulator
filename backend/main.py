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

def call_nova(prompt):

    response = bedrock.converse(
        modelId="amazon.nova-lite-v1:0",
        messages=[
            {
                "role": "user",
                "content": [
                    {"text": prompt}
                ]
            }
        ],
        inferenceConfig={
            "maxTokens": 500,
            "temperature": 0.7
        }
    )

    return response["output"]["message"]["content"][0]["text"]


# -------- Skill Extraction --------

def extract_skills(text):

    prompt = f"""
Extract all technical skills from the following text.

Return ONLY a comma separated list.

Text:
{text}
"""

    try:
        skills = call_nova(prompt)
    except:
        return []

    return [
        s.strip().lower()
        for s in skills.split(",")
        if s.strip()
    ]


# -------- Interview Memory --------

interview_questions = []
interview_answers = []
current_q = 0


# -------- Resume Upload + JD --------

@app.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    jd: str = Form(...)
):

    global interview_questions
    global interview_answers
    global current_q

    text = ""

    with pdfplumber.open(file.file) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""

    resume_skills = extract_skills(text)
    jd_skills = extract_skills(jd)

    matched = []
    missing = []

    for skill in jd_skills:
        if skill in resume_skills:
            matched.append(skill)
        else:
            missing.append(skill)

    score = 0
    if len(jd_skills) > 0:
        score = int((len(matched) / len(jd_skills)) * 100)

    # -------- Generate Interview Questions --------

    prompt = f"""
You are a technical interviewer.

Resume:
{text}

Job Description:
{jd}

Generate 5 interview questions for this candidate.
Return ONLY questions separated by newline.
"""

    try:
        nova_response = call_nova(prompt)
    except:
        nova_response = ""

    interview_questions = [
        q.strip()
        for q in nova_response.split("\n")
        if q.strip()
    ]

    # fallback questions
    if len(interview_questions) == 0:
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

    interview_answers.append({
        "question": question,
        "answer": data.answer
    })

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

        try:
            evaluation = call_nova(prompt)
        except:
            evaluation = "Evaluation failed"

        results.append({
            "question": qa["question"],
            "answer": qa["answer"],
            "evaluation": evaluation
        })

    return {"results": results}