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

4. **(WIP) Deploy to AWS:**
   _Note: The deployment to AWS is not connecting and filesystem or database, so the chat data will be lost when the container is stopped._

   - Use the `aws` cli to create a new Cloudformation stack, replacing the `ParameterValue` for `VpcId`, `SubnetIds`, and `SageMakerEndpointName` parameters with your own values:

     ```bash
     AWS_PROFILE=hf-sm AWS_DEFAULT_REGION=us-east-1    aws cloudformation create-stack \
     --stack-name OpenWebUIECSStack \
     --template-body file://ecs-openwebui-template.yaml \
     --parameters \
     ParameterKey=VpcId,ParameterValue=vpc-20e43f5d \
     ParameterKey=SubnetIds,ParameterValue=subnet-b73cb4e8\\,subnet-2d7df24b\\,subnet-a08b1e81 \
     ParameterKey=SageMakerEndpointName,ParameterValue=meta-llama-3-8b-instruct \
     --capabilities CAPABILITY_IAM
     ```

   - If you need to update the stack in the future, you can use the update-stack command:
     ```bash
     AWS_PROFILE=hf-sm AWS_DEFAULT_REGION=us-east-1    aws cloudformation update-stack \
     --stack-name OpenWebUIECSStack \
     --template-body file://ecs-openwebui-template.yaml \
     --parameters \
     ParameterKey=VpcId,ParameterValue=vpc-20e43f5d \
     ParameterKey=SubnetIds,ParameterValue=subnet-b73cb4e8\\,subnet-2d7df24b\\,subnet-a08b1e81 \
     ParameterKey=SageMakerEndpointName,ParameterValue=meta-llama-3-8b-instruct \
     --capabilities CAPABILITY_IAM
     ```
   - Once the Cloudformation stack is deployed, you will find the URL for accessing Open WebUI in the Outputs section of the stack.
   - Open the URL in your web browser.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request if you have any suggestions or improvements.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## Alternatives

If you prefer to run the Open WebUI and Pipelines seperatly locally, you can use the following commands:

```bash
docker run -it -p 9099:9099 --add-host=host.docker.internal:host-gateway -v $(pwd)/pipelines:/app/pipelines --env-file .env ghcr.io/open-webui/pipelines:latest
docker run -it -p 3000:8080 -v $(pwd)/open-webui:/app/backend/data -e WEBUI_AUTH=False -e OPENAI_API_BASE_URL=http://host.docker.internal:9099 -e OPENAI_API_KEY=0p3n-w3bu! ghcr.io/open-webui/open-webui:main
```
