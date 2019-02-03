import { Request, Response } from "express"
import { CertificateController } from '../controllers/certificate.controller'

export class CertificateRoutes {

  public certificateController : CertificateController =  new CertificateController()

  public routes(app): void {
    app.route('/certs').get(this.certificateController.getCertificates)
    app.route('/info/cert').get(this.certificateController.info)
  }
}