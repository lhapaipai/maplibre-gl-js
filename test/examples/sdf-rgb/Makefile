local_path	:= $(PWD)

sandbox_local_path 		:= $(local_path)
sandbox_host := maplibre-sdf-halo.pentatrion.com


.PHONY: deploy
deploy: ## deploy sandbox
	rsync -av \
		$(sandbox_local_path)/ \
		gap:$(sandbox_host)
	@echo "go : https://$(sandbox_host)"
