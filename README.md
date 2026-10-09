



# YouTube Focus


Você abre o YouTube só para ver um vídeo rápido, e de repente já se passaram 40 minutos de Shorts e recomendações que você nem queria assistir.

Esta extensão para Chrome ajuda a reduzir o uso impulsivo do YouTube.

Toda vez que você abre o YouTube, a extensão mostra uma frase de efeito e pergunta: **"Você realmente quer usar o YouTube agora?"**. Se a resposta for sim, você escolhe como quer usar:

-  **Modo Foco**: o YouTube sem distrações. Shorts, feed da página inicial, recomendações, comentários e autoplay ficam escondidos (cada item é configurável). Você define um objetivo para a sessão. A sessão termina após um período de inatividade ou quando você a encerra.
-  **Modo Relax**: tudo liberado, mas com tempo limitado. Quando o tempo acaba, o YouTube fica **bloqueado** por um período.

Tudo funciona localmente: nenhum dado sai do seu navegador.


https://github.com/user-attachments/assets/b8824f29-f0f0-494d-a7a1-bcf84c734792



## Instalação

### 1. Baixe o projeto

Clique em **Code → Download ZIP** no topo desta página e extraia o arquivo em uma pasta do seu computador.

**Git**

```sh
git clone https://github.com/spoycrab/youtube-focus-extension.git
```


### 2. Carregue no Chrome

1. Abra `chrome://extensions` na barra de endereços.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta do projeto (a que contém o arquivo `manifest.json`).


### Outros navegadores Chromium

| Navegador | Endereço |
|---|---|
| Microsoft Edge | `edge://extensions` |
| Brave | `brave://extensions` |
| Opera | `opera://extensions` |


## Configurações

- **Modo Foco:** o tempo de inatividade, o intervalo dos lembretes, se o objetivo é pedido e quais itens esconder.
- **Modo Relax:** a duração e o tempo de bloqueio.
- **Geral:** a página para onde o botão "Não, sair" leva e a frase de emergência.

As configurações só podem ser alteradas sem sessão ativa e fora do bloqueio, para que não dê para desligar os filtros no meio de uma sessão.

## To do:
  - Postar extenção na Chrome Web Store
  - Traduzir para outros idiomas
  - Gerar estatísticas básicas de uso (tempo assistido, número de visitas, categorias mais vistas etc.)
