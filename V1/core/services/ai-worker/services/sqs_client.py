"""SQS client helper for AI Worker (used when USE_SQS=true)."""
import json
import logging
from typing import Any, Callable, List, Optional

from config.settings import settings

logger = logging.getLogger(__name__)


def get_sqs_client():
    """Lazy import boto3 to avoid requiring it when USE_SQS=false."""
    import boto3
    return boto3.client(
        'sqs',
        region_name=settings.aws_region,
    )


def send_message(queue_url: str, body: dict) -> None:
    """Send a JSON message to an SQS queue."""
    client = get_sqs_client()
    client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(body),
    )
    logger.debug("Sent message to SQS queue %s", queue_url[:80] + "...")


def receive_messages(
    queue_url: str,
    max_messages: int = 10,
    wait_time_seconds: int = 20,
    visibility_timeout: int = 120,
) -> List[tuple[dict, str]]:
    """
    Long-poll receive messages from SQS.
    Returns list of (body_dict, receipt_handle) for each message.
    """
    client = get_sqs_client()
    response = client.receive_message(
        QueueUrl=queue_url,
        MaxNumberOfMessages=max_messages,
        WaitTimeSeconds=wait_time_seconds,
        VisibilityTimeout=visibility_timeout,
    )
    out = []
    for msg in response.get('Messages', []):
        try:
            body = json.loads(msg.get('Body', '{}'))
            out.append((body, msg['ReceiptHandle']))
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in SQS message, skipping")
    return out


def delete_message(queue_url: str, receipt_handle: str) -> None:
    """Delete a message from SQS after successful processing."""
    client = get_sqs_client()
    client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
    logger.debug("Deleted message from SQS queue")
