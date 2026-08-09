def detect_request_type(text):

    text = text.lower()

    homework_keywords = [
        "solve",
        "equation",
        "calculate",
        "answer",
        "math",
        "physics"
    ]

    summary_keywords = [
        "summary",
        "summarize",
        "brief",
        "short notes"
    ]

    for word in homework_keywords:
        if word in text:
            return "homework"

    for word in summary_keywords:
        if word in text:
            return "summary"

    return "normal"
