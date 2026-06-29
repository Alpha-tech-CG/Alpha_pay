# Terraform — raccourcis par environnement
# Usage : make <env>-init | <env>-plan | <env>-apply | <env>-destroy
# Exemples :
#   make dev-init
#   make staging-plan
#   make prod-apply

ENVS := dev staging prod

define TF_TARGETS
$(1)-init:
	terraform init -backend-config=backends/$(1).hcl -reconfigure

$(1)-plan:
	terraform plan -var-file=$(1).tfvars -out=$(1).plan.out

$(1)-apply:
	terraform apply $(1).plan.out

$(1)-destroy:
	@echo "⚠️  Destruction de l'environnement $(1). Ctrl-C pour annuler."
	terraform destroy -var-file=$(1).tfvars
endef

$(foreach env,$(ENVS),$(eval $(call TF_TARGETS,$(env))))

.PHONY: $(foreach env,$(ENVS),$(env)-init $(env)-plan $(env)-apply $(env)-destroy)
