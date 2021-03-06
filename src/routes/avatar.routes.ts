import { Application } from 'express'
import { AvatarController } from '../controllers/avatar.controller'

export class AvatarRoutes {

  public avatarController: AvatarController =  new AvatarController()

  public routes(app: Application): void {
    app.route('/avatars').get(this.avatarController.getAvatars)
    app.route('/info/avatar').get(this.avatarController.info)
    app.route('/avatar/available/:symbol').get(this.avatarController.getAvatarAvailability)
    app.route('/avatar/:symbol/assets').get(this.avatarController.getAvatarAssets)
  }
}
