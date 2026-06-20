# --- WAFv2 : allowlist d'IP sur les webhooks opérateur (ALP-160 / PAY-VULN-009) ---
#
# Couche défensive en complément du HMAC (ALP-158). NON appliquée tant que :
#   - les vraies plages IP MTN/Airtel ne sont pas confirmées (cf. docs/IP_ALLOWLIST.md)
#   - le compte AWS ne dispose pas des permissions WAFv2 (actuel : Secrets/KMS/Logs)
#
# Scope REGIONAL : à associer à l'ALB devant ECS. Pour Cloudflare, l'équivalent
# est une "IP Access Rule" / WAF custom rule sur le chemin /webhooks/*.

resource "aws_wafv2_ip_set" "operator_webhooks" {
  name               = "paybrain-${var.environment}-operator-webhook-ips"
  description        = "Plages IP autorisees pour les callbacks MTN/Airtel"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  # Placeholders — à remplacer par les plages réelles MTN/Airtel.
  addresses = concat(var.webhook_ip_allowlist_mtn, var.webhook_ip_allowlist_airtel)
}

resource "aws_wafv2_web_acl" "api" {
  name        = "paybrain-${var.environment}-api-acl"
  description = "WAF API PayBrain"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Bloque les requêtes vers /webhooks/* dont l'IP n'est PAS dans l'IP set.
  rule {
    name     = "webhook-ip-allowlist"
    priority = 1

    action {
      block {}
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/webhooks/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          not_statement {
            statement {
              ip_set_reference_statement {
                arn = aws_wafv2_ip_set.operator_webhooks.arn
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "WebhookIpBlocked"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "paybrainApiAcl"
    sampled_requests_enabled   = true
  }
}

# Association à l'ALB (référence externe à fournir quand l'ALB existe).
# resource "aws_wafv2_web_acl_association" "api" {
#   resource_arn = var.alb_arn
#   web_acl_arn  = aws_wafv2_web_acl.api.arn
# }
