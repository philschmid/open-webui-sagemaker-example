import json
import sagemaker
import boto3
from sagemaker.huggingface import HuggingFaceModel, get_huggingface_llm_image_uri
from huggingface_hub import get_token

try:
    role = sagemaker.get_execution_role()
except ValueError:
    iam = boto3.client("iam")
    role = iam.get_role(RoleName="sagemaker_execution_role")["Role"]["Arn"]

# Hub Model configuration. https://huggingface.co/models
hub = {
    "HF_MODEL_ID": "meta-llama/Meta-Llama-3-8B-Instruct",
    "SM_NUM_GPUS": json.dumps(1),
    "HF_TOKEN": get_token(),
    "MESSAGES_API_ENABLED": "true",
}

# create Hugging Face Model Class
huggingface_model = HuggingFaceModel(
    image_uri=get_huggingface_llm_image_uri("huggingface", version="2.2.0"),
    env=hub,
    role=role,
)

# deploy model to SageMaker Inference
predictor = huggingface_model.deploy(
    initial_instance_count=1,
    instance_type="ml.g5.2xlarge",
    container_startup_health_check_timeout=300,
    endpoint_name="meta-llama-3-8b-instruct",
)

# send request
predictor.predict(
    {
        "messages": [
            {"role": "system", "content": "Hello"},
            {"role": "user", "content": "Hi"},
        ]
    }
)

print(f"Endpoint name: {predictor.endpoint_name}")
