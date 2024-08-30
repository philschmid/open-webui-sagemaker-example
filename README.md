# Open WebUI SageMaker Example

This repository provides an example of how to deploy the OpenWebUI on AWS with an open LLM running on Amazon SageMaker, using [pipelines](https://github.com/open-webui/pipelines). This setup allows you to leverage the power of open-source LLMs within a user-friendly and customizable web interface. The LLM is deployed using a Python script (`deploy-llm.py`) and OpenWebUI is deployed using Cloudformation.

## Architecture Overview

The architecture consists of the following components:

- **[Open WebUI](https://github.com/open-webui/open-webui):** A versatile and user-friendly web interface for interacting with LLMs.
- **Amazon SageMaker:** A fully managed machine learning service used to host and deploy the open LLM.
- **[Pipelines](https://github.com/open-webui/pipelines):** A proxy that simplifies communication between Open WebUI and the SageMaker endpoint, providing a unified API experience.
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

3. **Test Open WebUI Locally with Docker Compose:**

   - copy the `.env.example` file to `.env` and fill in the required values.
   - Run the following command to start Open WebUI
     ```bash
     docker-compose up
     ```
   - Open the URL `http://localhost:3000` in your web browser.

4. **Deploy to AWS:**
   _Note: The deployment to AWS is not connecting and filesystem or database, so the chat data will be lost when the container is stopped._
   1. Using AWS CDK (Recommended):
      - Install the AWS CDK:
        ```bash
        npm install -g aws-cdk
        ```
      - Change into the `aws-cdk-ecs` directory.
      - Deploy the stack using the following command:
        _Note: Currently the SageMaker endpoint is not created by the CDK, so you need to provide the endpoint name as a parameter._
        ```bash
        cdk deploy --parameters OpenWebUiEcsCdkStack:SageMakerEndpointName=meta-llama-3-8b-instruct
        # ✨  Deployment time: 592.51s
        ```
      - Note the URL of the deployed Open WebUI in the output.
      - Open the URL in your web browser.
      - Clean up the stack using the following command:
        ```bash
        cdk destroy
        ```

## Planned Features

- [x] Add support for RDS/Aurora to store user data and chat history.
- [ ] Add support for deploying the LLM to a SageMaker endpoint using the CDK.
- [ ] Add support for multiple LLMs.
- [ ] Add support for deploying LLMs to ECS.
- [ ] Add support for EKS.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request if you have any suggestions or improvements.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## Alternatives

### Running Open WebUI and Pipelines Locally with Docker

If you prefer to run the Open WebUI and Pipelines seperatly locally, you can use the following commands:

```bash
docker run -it -p 9099:9099 --add-host=host.docker.internal:host-gateway -v $(pwd)/pipelines:/app/pipelines --env-file .env ghcr.io/open-webui/pipelines:latest
docker run -it -p 3000:8080 -v $(pwd)/open-webui:/app/backend/data -e WEBUI_AUTH=False -e OPENAI_API_BASE_URL=http://host.docker.internal:9099 -e OPENAI_API_KEY=0p3n-w3bu! ghcr.io/open-webui/open-webui:main
```
