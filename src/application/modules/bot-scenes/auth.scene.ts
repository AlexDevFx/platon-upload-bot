import { BaseScene, Stage } from 'telegraf';
import { Injectable } from '@nestjs/common';
import { SceneContextMessageUpdate } from 'telegraf/typings/stage';
const { leave } = Stage;

interface AuthSceneState {
  user: {
    telegramId: bigint;
    activationCode: number;
  };
}

@Injectable()
export class AuthSceneBuilder {
  public build(): BaseScene<SceneContextMessageUpdate> {
    const scene = new BaseScene('auth');

    scene.enter(async ctx => {
      ctx.scene.state = {
        user: {
          telegramId: ctx.from.id,
          activationCode: undefined,
        },
        step: 'PersonalNumber',
      };

      await ctx.reply('Please, enter activation code (digits only):');
    });

    scene.leave(() => {
      leave();
    });

    scene.hears(/\d+/gi, async ctx => {
      (ctx.scene.state as AuthSceneState).user.activationCode = Number(ctx.message.text);

      await ctx.reply(`Thank you!`);
      await ctx.scene.leave();
    });

    return scene;
  }
}
