"""The papers (subjects) and their topics that every institute's question bank uses.

This list is the same for all institutes and is not editable in Phase 1. It follows the CUET-style paper list:
37 papers in three sections. Each question belongs to one paper and one topic of that paper.
"""

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

PAPERS: list[dict] = (
    [{"id": pid, "name": name, "section": "I: Language", "stream": "All", "topics": LANGUAGE_TOPICS}
     for pid, name in LANGUAGES]
    + [{"id": pid, "name": name, "section": "II: Domain", "stream": stream, "topics": topics}
       for pid, name, stream, topics in _DOMAIN]
    + [{"id": "general-aptitude", "name": "General Aptitude Test", "section": "III: General", "stream": "All",
        "topics": _GENERAL_TOPICS}]
)

BY_ID = {paper["id"]: paper for paper in PAPERS}
