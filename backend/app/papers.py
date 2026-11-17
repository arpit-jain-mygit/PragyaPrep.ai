"""The papers (subjects) and their topics that every institute's question bank uses.

This list is the same for all institutes and is not editable in Phase 1. It follows the CUET-style paper list
(37 papers in three sections), plus six papers for management and law entrance exams (IPMAT, CAT, CLAT) in a fourth
section. Each question belongs to one paper and one topic of that paper.
"""
import re

LANGUAGE_TOPICS = ["Reading comprehension", "Vocabulary", "Grammar", "Verbal ability"]

LANGUAGES = [
    ("english", "English"), ("hindi", "Hindi"), ("assamese", "Assamese"), ("bengali", "Bengali"),
    ("gujarati", "Gujarati"), ("kannada", "Kannada"), ("malayalam", "Malayalam"), ("marathi", "Marathi"),
    ("odia", "Odia"), ("punjabi", "Punjabi"), ("tamil", "Tamil"), ("telugu", "Telugu"), ("urdu", "Urdu"),
]

# (id, name, section, stream, topics)
_DOMAIN = [
    ("physics", "Physics", "Science", [
        "Electrostatics", "Current electricity", "Magnetism", "EMI and AC", "EM waves", "Optics",
        "Dual nature", "Atoms and nuclei", "Semiconductors"]),
    ("chemistry", "Chemistry", "Science", [
        "Solutions", "Electrochemistry", "Kinetics", "d- and f-block", "Coordination compounds",
        "Organic chemistry (haloalkanes to amines)", "Biomolecules"]),
    ("mathematics", "Mathematics / Applied Mathematics", "Science, Commerce", [
        "Common part", "Functions", "Calculus", "Vectors", "3D geometry", "Linear programming (LPP)",
        "Probability", "Numerical applications", "Statistics", "Financial mathematics"]),
    ("biology", "Biology", "Science", [
        "Reproduction", "Genetics and evolution", "Human health", "Microbes", "Biotechnology", "Ecology"]),
    ("computer-science", "Computer Science / Informatics Practices", "Science", [
        "Python exceptions and files", "Stack", "Queue", "Searching", "Sorting", "Databases and SQL",
        "Networks", "Security", "Project-based learning"]),
    ("environmental-science", "Environmental Science", "Science", [
        "Human beings and nature", "Conservation ecology", "Pollution", "Third World development",
        "Sustainable agriculture", "Resource economics", "Global treaties"]),
    ("agriculture", "Agriculture", "Science", [
        "Agrometeorology", "Genetics and plant breeding", "Biochemistry and microbiology", "Livestock",
        "Crop production", "Horticulture"]),
    ("accountancy", "Accountancy / Book Keeping", "Commerce", [
        "Not-for-profit organisations", "Partnership accounts", "Goodwill",
        "Admission, retirement and death of a partner", "Dissolution", "Company accounts", "Ratios",
        "Cash flow"]),
    ("business-studies", "Business Studies", "Commerce", [
        "Management principles", "Business environment", "Planning", "Organising", "Staffing", "Directing",
        "Controlling", "Financial markets", "Marketing", "Consumer protection"]),
    ("economics", "Economics / Business Economics", "Commerce, Humanities", [
        "Microeconomics", "Macroeconomics", "Indian economic development"]),
    ("history", "History", "Humanities", [
        "Harappan to early states", "Buddhism", "Travellers", "Bhakti-Sufi", "Vijayanagara",
        "Mughal agrarian society", "1857", "Gandhi", "The Constitution"]),
    ("political-science", "Political Science", "Humanities", [
        "Contemporary world politics", "Politics in India since Independence"]),
    ("geography", "Geography / Geology", "Humanities", [
        "Human geography", "India's people and economy", "Map work"]),
    ("psychology", "Psychology", "Humanities", [
        "Intelligence", "Personality", "Stress", "Disorders", "Therapies", "Attitudes", "Social influence"]),
    ("sociology", "Sociology", "Humanities", [
        "Indian society", "Social change and development in India"]),
    ("anthropology", "Anthropology", "Humanities", [
        "Human evolution", "Prehistoric archaeology", "Social and cultural anthropology", "Fieldwork",
        "Tribes of India"]),
    ("home-science", "Home Science", "Humanities", [
        "Nutrition", "Human development", "Fabric and apparel", "Resource management", "Extension"]),
    ("physical-education", "Physical Education (Yoga, Sports)", "All", [
        "Sports management", "Yoga", "Nutrition", "Testing", "Fitness", "Physiology and biomechanics",
        "Sports psychology", "Training"]),
    ("mass-media", "Mass Media / Mass Communication", "Humanities", [
        "Communication", "Journalism", "Print", "Radio", "TV", "Cinema", "New media", "Advertising"]),
    ("sanskrit", "Sanskrit", "Humanities", [
        "Comprehension", "Grammar (sandhi, samasa, karaka)", "Prescribed texts", "History of literature"]),
    ("knowledge-traditions", "Knowledge Traditions and Practices of India", "Humanities", [
        "Language and literature", "Arts", "Science", "Mathematics", "Medicine", "Metallurgy", "Agriculture",
        "Trade"]),
    ("fine-arts", "Fine Arts / Visual Arts / Commercial Arts", "Humanities", [
        "Miniature painting schools", "The Bengal School", "Modern Indian art"]),
    ("performing-arts", "Performing Arts (Dance, Drama, Music)", "Humanities", [
        "Music terms", "Hindustani and Carnatic music", "Classical and folk dance", "Theatre"]),
]

_GENERAL_TOPICS = [
    "General knowledge", "Current affairs", "Mental ability", "Numerical ability", "Quantitative reasoning",
    "Logical reasoning"]

# Papers for the management and law entrance exams. Topics follow the usual published sections.
_ENTRANCE = [
    ("quantitative-ability", "Quantitative Ability", [
        "Arithmetic", "Algebra", "Geometry and mensuration", "Number system", "Modern mathematics",
        "Data sufficiency"]),
    ("verbal-ability-rc", "Verbal Ability and Reading Comprehension", [
        "Reading comprehension", "Para jumbles", "Para summary", "Odd sentence out", "Sentence completion",
        "Grammar and usage", "Vocabulary"]),
    ("data-interpretation", "Data Interpretation", [
        "Tables", "Bar and line graphs", "Pie charts", "Caselets", "Mixed charts"]),
    ("logical-reasoning", "Logical Reasoning", [
        "Arrangements", "Puzzles", "Syllogisms", "Blood relations and directions", "Sets and Venn diagrams",
        "Critical reasoning", "Series and coding"]),
    ("legal-reasoning", "Legal Reasoning", [
        "Legal principles and facts", "Legal knowledge", "Constitutional law", "Contract law", "Law of torts",
        "Criminal law"]),
    ("current-affairs-gk", "Current Affairs and General Knowledge", [
        "Current affairs", "India and the world", "Polity", "Economy", "History and culture", "Science and technology",
        "Static GK"]),
]

PAPERS: list[dict] = (
    [{"id": pid, "name": name, "section": "I: Language", "stream": "All", "topics": LANGUAGE_TOPICS}
     for pid, name in LANGUAGES]
    + [{"id": pid, "name": name, "section": "II: Domain", "stream": stream, "topics": topics}
       for pid, name, stream, topics in _DOMAIN]
    + [{"id": "general-aptitude", "name": "General Aptitude Test", "section": "III: General", "stream": "All",
        "topics": _GENERAL_TOPICS}]
    + [{"id": pid, "name": name, "section": "IV: Management and law entrance", "stream": "All", "topics": topics}
       for pid, name, topics in _ENTRANCE]
)

BY_ID = {paper["id"]: paper for paper in PAPERS}


# The papers usually used by each course, found by a word in the course name (so "CAT 2027" matches CAT).
# The admin can always change them. CUET uses the original 37 papers.
_ENTRANCE_IDS = {pid for pid, _, _ in _ENTRANCE}
SUGGESTED = {
    "cuet": [paper["id"] for paper in PAPERS if paper["id"] not in _ENTRANCE_IDS],
    "ipmat": ["quantitative-ability", "verbal-ability-rc", "logical-reasoning"],
    "cat": ["verbal-ability-rc", "data-interpretation", "logical-reasoning", "quantitative-ability"],
    "clat": ["verbal-ability-rc", "current-affairs-gk", "legal-reasoning", "logical-reasoning", "quantitative-ability"],
}


def suggested_for(course_name: str) -> list[str]:
    """The usual papers for a course, from its name. Empty when the name isn't one we know."""
    words = set(re.findall(r"[a-z0-9]+", str(course_name).lower()))
    for key, ids in SUGGESTED.items():
        if key in words:
            return list(ids)
    return []
