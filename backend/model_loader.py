response = model.generate(
    system_prompt + user_input
)
from llama_cpp import Llama
llm=Llama(
    model_path="models/model.gguf",
    n_ctx=4096,
    n_threads=8,
    verbose=False
    )
def generate_response(prompt):
    output = llm(
        prompt,
        max_tokens=512,
        temperature=0.7,
        stop=["User:", "Assisstant:"]
        )
    return output["choices"][0]["text"].strip()
