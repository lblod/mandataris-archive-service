# mandataris-archive-service

This microservice provides an endpoint to archive a mandataris. That means that instead of being hardly removed, it will be archived in a graveyard graph. This soft delete is helping keeping consistency in our data, avoind unresolving URIs.

## Installation

To add the service to your stack, add the following snippet to docker-compose.yml:

```
mandataris-archive:
  image: lblod/mandataris-archive-service:0.0.3
  labels:
      - "logging=true"
  restart: always
  logging: *default-logging
```
