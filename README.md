# Open WebUI SageMaker Example

This repository provides an example of how to deploy the OpenWebUI on AWS with an open LLM running on Amazon SageMaker, using LiteLLM as a proxy. This setup allows you to leverage the power of open-source LLMs within a user-friendly and customizable web interface. The LLM is deployed using a Python script (`deploy-llm.py`) and OpenWebUI is deployed using Cloudformation.

## Architecture Overview

The architecture consists of the following components:

- **[Open WebUI](https://github.com/open-webui/open-webui):** A versatile and user-friendly web interface for interacting with LLMs.
- **Amazon SageMaker:** A fully managed machine learning service used to host and deploy the open LLM.
- **[LiteLLM](https://github.com/BerriAI/litellm):** A proxy that simplifies communication between Open WebUI and the SageMaker endpoint, providing a unified API experience.
- **Python Script (`deploy-llm.py`):** Deploys the chosen LLM model to a SageMaker endpoint.
- **Cloudformation:** Used to deploy and manage the OpenWebUI instance.

## Prerequisites

- An AWS account with appropriate permissions.
- Python installed and configured.
- The AWS CLI installed and configured.
- A Hugging Face API token

## Getting Started

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/philschmid/open-webui-sagemaker-example.git
   cd open-webui-sagemaker-example
   ```

2. **Deploy the LLM:**

   - Make sure you are logged in to the AWS CLI and `huggingface_hub`
   - Run the script:
     ```bash
     python deploy-llm.py
     ```
   - Note the endpoint name created by the script.

3. **Test Open WebUI and LiteLLM Locally with Docker Compose:**

4. **Deploy to AWS:**

   - Once the Cloudformation stack is deployed, you will find the URL for accessing Open WebUI in the Outputs section of the stack.
   - Open the URL in your web browser.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request if you have any suggestions or improvements.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

docker run -it -p 4000:4000 -v $(pwd)/proxy.yaml:/proxy.yaml ghcr.io/berriai/litellm:main-latest --config /proxy.yaml

docker run -it -p 9099:9099 --add-host=host.docker.internal:host-gateway -v $(pwd)/pipelines:/app/pipelines --env-file .env ghcr.io/open-webui/pipelines:latest
docker run -it -p 3000:8080 -v $(pwd)/open-webui:/app/backend/data -e WEBUI_AUTH=False -e OPENAI_API_BASE_URL=http://host.docker.internal:9099 -e OPENAI_API_KEY=0p3n-w3bu! ghcr.io/open-webui/open-webui:main
